/**
 * models/Log.js — Carbon Footprint Tracker
 *
 * Records a single day's activity data for one user and the resulting
 * calculated carbon footprint in kg CO₂e.
 *
 * A user may submit at most ONE log per calendar day (UTC). This is enforced
 * by a compound unique index on (user, logDate) and validated in the controller.
 *
 * Carbon calculation coefficients are documented inline; the authoritative
 * computation lives in utils/carbonEngine.js so this model stays as a
 * pure data schema.
 */

'use strict';

const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// Enum Definitions — kept in the model so controllers + tests can import them
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TRANSPORT_MODES — each key maps to a kg CO₂ per kilometre emission factor.
 *
 * Sources: UK DEFRA 2023 emission factors; EU EEA average vehicle figures.
 *   car_petrol   : 0.192 kg CO₂/km  (average petrol passenger car)
 *   car_diesel   : 0.171 kg CO₂/km  (average diesel passenger car)
 *   car_electric : 0.053 kg CO₂/km  (UK grid mix, 2023)
 *   motorbike    : 0.114 kg CO₂/km
 *   bus          : 0.089 kg CO₂/km  (local bus, average occupancy)
 *   train        : 0.041 kg CO₂/km  (national rail average)
 *   tram_metro   : 0.029 kg CO₂/km
 *   cycling      : 0.000 kg CO₂/km  (human powered)
 *   walking      : 0.000 kg CO₂/km
 *   flight_short : 0.255 kg CO₂/km  (short-haul <3h, per passenger, incl. RFI)
 *   flight_long  : 0.195 kg CO₂/km  (long-haul, per passenger, incl. RFI)
 *   none         : 0.000 kg CO₂/km  (stayed home / no travel)
 */
const TRANSPORT_MODES = [
  'car_petrol',
  'car_diesel',
  'car_electric',
  'motorbike',
  'bus',
  'train',
  'tram_metro',
  'cycling',
  'walking',
  'flight_short',
  'flight_long',
  'none',
];

/**
 * DIET_TYPES — daily dietary carbon footprint (kg CO₂e per person per day).
 *
 * Sources: Poore & Nemecek (2018) "Reducing food's environmental impacts";
 *          Oxford University / Our World in Data dietary footprint estimates.
 *   meat_heavy   : 7.19 kg CO₂e/day  (>100g red meat)
 *   meat_medium  : 5.63 kg CO₂e/day  (50–100g meat)
 *   meat_low     : 4.67 kg CO₂e/day  (<50g meat)
 *   pescatarian  : 3.91 kg CO₂e/day  (fish, no meat)
 *   vegetarian   : 3.81 kg CO₂e/day  (dairy + eggs, no meat/fish)
 *   vegan        : 2.89 kg CO₂e/day  (plant-based only)
 */
const DIET_TYPES = [
  'meat_heavy',
  'meat_medium',
  'meat_low',
  'pescatarian',
  'vegetarian',
  'vegan',
];

// ─────────────────────────────────────────────────────────────────────────────
// Sub-schema: TransportEntry
// Supports logging multiple legs of travel in a single day (e.g. car + train).
// ─────────────────────────────────────────────────────────────────────────────
const TransportEntrySchema = new mongoose.Schema(
  {
    mode: {
      type: String,
      required: [true, 'Transport mode is required.'],
      enum: { values: TRANSPORT_MODES, message: '{VALUE} is not a recognised transport mode.' },
    },
    distanceKm: {
      type: Number,
      required: [true, 'Distance in km is required.'],
      min: [0, 'Distance cannot be negative.'],
      max: [20000, 'Distance exceeds the maximum single-entry limit of 20,000 km.'],
    },
    /** Computed by carbonEngine and stored for transparency / debugging. */
    emissionsKg: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: false }
);

// ─────────────────────────────────────────────────────────────────────────────
// Sub-schema: EnergyUsage
// Home energy consumption for the logged day.
// ─────────────────────────────────────────────────────────────────────────────
const EnergyUsageSchema = new mongoose.Schema(
  {
    /**
     * electricityKwh — household electricity consumed that day.
     * Typical UK home: ~8–10 kWh/day. 0 is valid (away from home, solar offset).
     */
    electricityKwh: {
      type: Number,
      required: [true, 'Electricity consumption (kWh) is required.'],
      min: [0, 'Electricity consumption cannot be negative.'],
      max: [500, 'Electricity value seems too high. Please check your entry.'],
    },

    /**
     * naturalGasKwh — gas consumed for heating/cooking.
     * 0 is valid for all-electric homes.
     */
    naturalGasKwh: {
      type: Number,
      default: 0,
      min: [0, 'Natural gas consumption cannot be negative.'],
      max: [500, 'Gas value seems too high. Please check your entry.'],
    },

    /** Computed emissions from energy use, stored per-log for auditing. */
    emissionsKg: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: false }
);

// ─────────────────────────────────────────────────────────────────────────────
// Main Schema: Log
// ─────────────────────────────────────────────────────────────────────────────
const LogSchema = new mongoose.Schema(
  {
    // ── Ownership ─────────────────────────────────────────────────────────────
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Log must belong to a user.'],
      index: true,
    },

    // ── Date ─────────────────────────────────────────────────────────────────
    /**
     * logDate — the calendar date (UTC midnight) this log represents.
     * Stored as a Date with the time component zeroed so the compound
     * unique index (user + logDate) correctly prevents duplicate daily logs.
     */
    logDate: {
      type: Date,
      required: [true, 'Log date is required.'],
    },

    // ── Activity Inputs ───────────────────────────────────────────────────────
    transport: {
      type: [TransportEntrySchema],
      default: [],
      validate: {
        validator(arr) {
          return arr.length <= 10; // Prevent absurdly large arrays
        },
        message: 'A maximum of 10 transport legs can be logged per day.',
      },
    },

    diet: {
      type: String,
      required: [true, 'Diet type is required.'],
      enum: { values: DIET_TYPES, message: '{VALUE} is not a recognised diet type.' },
    },

    energy: {
      type: EnergyUsageSchema,
      required: [true, 'Energy usage is required.'],
    },

    // ── Computed Result ───────────────────────────────────────────────────────
    /**
     * calculatedCarbonKg — total CO₂e emissions for the day in kg.
     * Computed by carbonEngine.calculate() and stored here permanently
     * so historical records remain accurate even if coefficients change.
     */
    calculatedCarbonKg: {
      type: Number,
      required: true,
      min: [0, 'Calculated carbon cannot be negative.'],
    },

    /**
     * breakdown — individual contributions from each category (kg CO₂e).
     * Stored for use in the frontend "what's driving my footprint?" chart.
     */
    breakdown: {
      transportKg: { type: Number, default: 0, min: 0 },
      dietKg:      { type: Number, default: 0, min: 0 },
      energyKg:    { type: Number, default: 0, min: 0 },
    },

    // ── Gamification Context ─────────────────────────────────────────────────
    /**
     * beatBaseline — true if calculatedCarbonKg < user's baselineCarbon at
     * time of logging. Stored so we don't need to re-derive it on reads.
     */
    beatBaseline: {
      type: Boolean,
      default: false,
    },

    /** XP awarded for this log entry (0 if baseline was not beaten). */
    xpAwarded: {
      type: Number,
      default: 0,
      min: 0,
    },

    /** Optional free-text note the user may attach to the day's log. */
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes cannot exceed 500 characters.'],
      default: '',
    },
  },
  {
    timestamps: true, // createdAt = submission time; logDate = the activity day
    toJSON:   { virtuals: true, transform(doc, ret) { delete ret.__v; return ret; } },
    toObject: { virtuals: true },
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Indexes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unique constraint: one log per user per calendar day.
 * The controller must zero the time component of logDate before querying.
 */
LogSchema.index({ user: 1, logDate: 1 }, { unique: true });

/** Efficient chronological listing for the user's log history. */
LogSchema.index({ user: 1, logDate: -1 });

// ─────────────────────────────────────────────────────────────────────────────
// Virtuals
// ─────────────────────────────────────────────────────────────────────────────

/** Human-readable label for the log date (YYYY-MM-DD). */
LogSchema.virtual('logDateFormatted').get(function () {
  return this.logDate.toISOString().slice(0, 10);
});

// ─────────────────────────────────────────────────────────────────────────────
// Static Exports — controllers can import enums without duplicating them
// ─────────────────────────────────────────────────────────────────────────────
LogSchema.statics.TRANSPORT_MODES = TRANSPORT_MODES;
LogSchema.statics.DIET_TYPES      = DIET_TYPES;

const Log = mongoose.model('Log', LogSchema);

// Also export the raw arrays for use in carbonEngine without importing the model
Log.TRANSPORT_MODES = TRANSPORT_MODES;
Log.DIET_TYPES      = DIET_TYPES;

module.exports = Log;
