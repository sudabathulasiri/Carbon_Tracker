const jwt = require('jsonwebtoken');

/**
 * Verifies the Bearer token from the Authorization header.
 * Attaches the decoded payload to req.user for downstream handlers.
 */
const protect = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Attach minimal payload — full user fetched in controller if needed
    req.user = { id: decoded.id, email: decoded.email };
    next();
  } catch (error) {
    // Let the global error handler normalise the JWT error messages
    next(error);
  }
};

module.exports = { protect };