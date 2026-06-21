/**
 * models/User.js — Carbon Footprint Tracker
 *
 * Stores identity, credentials, carbon baseline, gamification state (XP +
 * badges), and aggregate statistics. Password hashing and JWT generation
 * live here so controllers stay thin.
 */

'use strict';

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');

// ─────────────────────────────────────────────────────────────────────────────
// Badge metadata catalogue — single source of truth for all badge definitions
// ─────────────────────────────────────────────────────────────────────────────
const BADGE_CATALOGUE = {
  FIRST_LOG:        { label: 'First Step',        icon: '🌱', description: 'Logged your carbon footprint for the very first time.' },
  WEEK_STREAK:      { label: '7-Day Streak',       icon: '🔥', description: 'Logged every day for 7 consecutive days.' },
  MONTH_STREAK:     { label: '30-Day Streak',      icon: '💎', description: 'Logged every day for 30 consecutive days.' },
  BASELINE_BEATER:  { label: 'Baseline Beater',    icon: '🎯', description: 'Beat your personal carbon baseline for the first time.' },
  CARBON_CUTTER_10: { label: 'Carbon Cutter 10%',  icon: '✂️',  description: 'Reduced your average daily footprint by 10% below baseline.' },
  CARBON_CUTTER_25: { label: 'Carbon Cutter 25%',  icon: '⚡',  description: 'Reduced your average daily footprint by 25% below baseline.' },
  CARBON_CUTTER_50: { label: 'Carbon Cutter 50%',  icon: '🏆', description: 'Reduced your average daily footprint by 50% below baseline.' },
  GREEN_COMMUTER:   { label: 'Green Commuter',     icon: '🚴', description: '5 consecutive days using transit, cycling, or walking only.' },
  PLANT_WEEK:       { label: 'Plant Week',         icon: '🥦', description: '7 consecutive days on a vegan or vegetarian diet.' },
  LOW_ENERGY_HERO:  { label: 'Low Energy Hero',    icon: '💡', description: '3 consecutive days with home energy use at or below 2 kWh.' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-schema: Badge
// ─────────────────────────────────────────────────────────────────────────────
const BadgeSchema = new mongoose.Schema(
  {
    code:        { type: String, required: true, enum: Object.keys(BADGE_CATALOGUE) },
    label:       { type: String, required: true },
    icon:        { type: String, required: true },
    description: { type: String, required: true },
    awardedAt:   { type: Date,   default: Date.now },
  },
  { _id: false }
);

// ─────────────────────────────────────────────────────────────────────────────
// Main Schema: User
// ─────────────────────────────────────────────────────────────────────────────
const UserSchema = new mongoose.Schema(
  {
    // ── Identity ─────────────────────────────────────────────────────────────
    name: {
      type: String,
      required: [true, 'Name is required.'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters.'],
      maxlength: [60, 'Name cannot exceed 60 characters.'],
    },

    email: {
      type: String,
      required: [true, 'Email address is required.'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address.'],
    },

    password: {
      type: String,
      required: [true, 'Password is required.'],
      minlength: [8, 'Password must be at least 8 characters.'],
      select: false, // Excluded from all queries by default — must be explicitly requested
    },

    // ── Carbon Baseline ───────────────────────────────────────────────────────
    /**
     * Daily carbon footprint in kg CO₂e used as the personal reference point.
     * Default 12.0 kg ≈ global average (~4.4 t/year ÷ 365).
     * Users set this during onboarding; it can be updated via the profile API.
     */
    baselineCarbon: {
      type: Number,
      default: 12.0,
      min: [0, 'Baseline carbon cannot be negative.'],
    },

    // ── Gamification ─────────────────────────────────────────────────────────
    /**
     * Lifetime XP. Awarded when a logged day beats the user's baseline.
     * Bonus multipliers apply for streak lengths (see carbonController).
     */
    currentXP: {
      type: Number,
      default: 0,
      min: 0,
    },

    /** Number of consecutive calendar days the user has submitted a log. */
    currentStreak: {
      type: Number,
      default: 0,
      min: 0,
    },

    longestStreak: {
      type: Number,
      default: 0,
      min: 0,
    },

    /**
     * Date of the most recent log submission (midnight UTC of that day).
     * Used to compute streak continuity without querying the Log collection.
     */
    lastLogDate: {
      type: Date,
      default: null,
    },

    badges: {
      type: [BadgeSchema],
      default: [],
    },

    // ── Aggregate Stats ───────────────────────────────────────────────────────
    /** Running count of submitted Log documents — avoids COUNT(*) queries. */
    totalLogs: {
      type: Number,
      default: 0,
      min: 0,
    },

    /** Lifetime sum of all calculatedCarbonKg values across every log. */
    totalCarbonKg: {
      type: Number,
      default: 0,
      min: 0,
    },

    /**
     * Lifetime kg of carbon saved vs baseline on days where the user beat it.
     * Accumulated as: sum of (baselineCarbon - calculatedCarbonKg) per green day.
     */
    totalCarbonSavedKg: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ── Account State ─────────────────────────────────────────────────────────
    isActive: {
      type: Boolean,
      default: true,
    },

    refreshToken: {
      type: String,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true, transform(doc, ret) { delete ret.password; delete ret.__v; return ret; } },
    toObject: { virtuals: true },
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Virtuals
// ─────────────────────────────────────────────────────────────────────────────

/**
 * level — derived from XP via a square-root curve.
 *   Formula:  level = floor(sqrt(currentXP / 100)) + 1
 *   Level 1:    0 – 99 XP
 *   Level 2:  100 – 399 XP
 *   Level 3:  400 – 899 XP  … and so on.
 */
UserSchema.virtual('level').get(function () {
  return Math.floor(Math.sqrt(this.currentXP / 100)) + 1;
});

/** XP threshold for the next level. */
UserSchema.virtual('xpToNextLevel').get(function () {
  const next = this.level; // current level index (0-based internal)
  return Math.pow(next, 2) * 100 - this.currentXP;
});

/** Average daily carbon across all submitted logs, rounded to 2 dp. */
UserSchema.virtual('averageDailyCarbonKg').get(function () {
  if (!this.totalLogs) return 0;
  return Math.round((this.totalCarbonKg / this.totalLogs) * 100) / 100;
});

// ─────────────────────────────────────────────────────────────────────────────
// Indexes
// ─────────────────────────────────────────────────────────────────────────────
UserSchema.index({ currentXP: -1 }); // Leaderboard support

// ─────────────────────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────────────────────

/** Hash password before insert or password change. bcrypt cost 12 ≈ 300ms. */
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Instance Methods
// ─────────────────────────────────────────────────────────────────────────────

/**
 * comparePassword — verify plain-text input against the stored bcrypt hash.
 * @param {string} candidate
 * @returns {Promise<boolean>}
 */
UserSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

/**
 * generateAccessToken — sign a JWT containing minimal user identity.
 * @returns {string}
 */
UserSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    { id: this._id, email: this.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

/**
 * hasBadge — check whether a badge code has already been awarded.
 * @param {string} code
 * @returns {boolean}
 */
UserSchema.methods.hasBadge = function (code) {
  return this.badges.some((b) => b.code === code);
};

/**
 * awardBadge — idempotently grant a badge from the catalogue.
 * @param {string} code — must be a key in BADGE_CATALOGUE
 * @returns {boolean} true if the badge was newly granted; false if already held
 */
UserSchema.methods.awardBadge = function (code) {
  if (this.hasBadge(code)) return false;
  const meta = BADGE_CATALOGUE[code];
  if (!meta) return false;
  this.badges.push({ code, ...meta });
  return true;
};

/**
 * awardXP — add XP points to the user's running total.
 * @param {number} points
 */
UserSchema.methods.awardXP = function (points) {
  this.currentXP += Math.max(0, Math.round(points));
};

// ─────────────────────────────────────────────────────────────────────────────
// Static Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Expose the catalogue so controllers can reference badge codes without magic strings. */
UserSchema.statics.BADGE_CATALOGUE = BADGE_CATALOGUE;

module.exports = mongoose.model('User', UserSchema);
