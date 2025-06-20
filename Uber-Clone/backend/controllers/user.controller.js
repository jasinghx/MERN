const userModel = require("../models/user.model");
const userService = require("../services/user.service");
const { validationResult } = require("express-validator");
const blacklistedTokenModel = require("../models/blacklisted-token.model");

/**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
module.exports.registerUser = async (req, res, next) => {
  try {
    // Check for errors in the request body
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { fullname, email, password } = req.body;

    // Check if user already exists
    const doesUserExist = await userModel.exists({ email });
    if (doesUserExist) {
      return res
        .status(400)
        .json({ message: "User with this email already exists" });
    }

    const hashedPassword = await userModel.hashPassword(password);

    const user = await userService.createUser({
      fullname,
      email,
      password: hashedPassword,
    });

    // Generate token
    const token = user.generateAuthToken();

    // 201 - Created
    return res.status(201).json({ token, user });
  } catch (error) {
    console.error("Error registering user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Login a user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
module.exports.loginUser = async (req, res, next) => {
  try {
    // Check for errors in the request body
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user by email
    // Note: The password field is selected explicitly to allow password comparison
    const user = await userModel.findOne({ email }).select("+password"); // + select includes the password field in the result
    if (!user) {
      return res.status(401).json({ message: "Invalid email" });
    }

    // Compare the provided password with the stored hashed password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // Generate token
    const token = user.generateAuthToken();
    // Check if the token is blacklisted
    const isBlacklisted = await blacklistedTokenModel.exists({ token });
    if (isBlacklisted) {
      return res
        .status(401)
        .json({ message: "Token is blacklisted, please login again" });
    }

    // 200 - OK
    return res.status(200).json({ token, user });
  } catch (error) {
    console.error("Error logging in user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Get user profile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
module.exports.getUserProfile = async (req, res, next) => {
  try {
    const user = await userModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.status(200).json({ user });
  } catch (error) {
    console.error("Error getting user profile:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Logout user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
module.exports.logoutUser = async (req, res, next) => {
  try {
    // Store the cookie in the database
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Unauthorised" });
    }

    await blacklistedTokenModel.create({ token }); // automatically sets expiration based on the schema

    // Clear the cookie
    res.clearCookie("token");

    return res.status(200).json({ message: "User logged out successfully" });
  } catch (error) {
    console.error("Error logging out user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
