import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { User } from "../models/userModel.js";

export function loginPage(req, res) {
  if (req.session.user) return res.redirect("/");
  res.render("login", {
    title: "Sign in | JAPZGRILL Inventory",
    error: null,
    registered: req.query.registered === "1",
    csrfToken: req.session.csrfToken
  });
}

export function registerPage(req, res) {
  if (req.session.user) return res.redirect("/");
  res.render("register", {
    title: "Create account | JAPZGRILL Inventory",
    error: null,
    csrfToken: req.session.csrfToken
  });
}

export async function register(req, res, next) {
  const renderError = (status, error) => res.status(status).render("register", {
    title: "Create account | JAPZGRILL Inventory",
    error,
    csrfToken: req.session.csrfToken
  });

  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");

    if (!name || name.length > 255) {
      return renderError(400, "Enter your name (up to 255 characters).");
    }
    if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return renderError(400, "Enter a valid email address.");
    }
    if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
      return renderError(400, "Password must be at least 12 characters and no more than 72 bytes.");
    }
    if (password !== confirmPassword) {
      return renderError(400, "The passwords do not match.");
    }
    if (await User.findOne({ where: { email } })) {
      return renderError(409, "An account with that email already exists. Try signing in instead.");
    }

    await User.create({
      name,
      email,
      password: await bcrypt.hash(password, 12),
      role: "visitors"
    });
    res.redirect(303, "/login?registered=1");
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return renderError(409, "An account with that email already exists. Try signing in instead.");
    }
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!email || !password) {
      return res.status(400).render("login", {
        title: "Sign in | JAPZGRILL Inventory",
        error: "Enter your email and password.",
        csrfToken: req.session.csrfToken
      });
    }
    const user = await User.findOne({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).render("login", {
        title: "Sign in | JAPZGRILL Inventory",
        error: "The email or password you entered is incorrect.",
        csrfToken: req.session.csrfToken
      });
    }
    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => error ? reject(error) : resolve());
    });
    req.session.user = { id: user.id, name: user.name, role: user.role };
    req.session.csrfToken = randomBytes(32).toString("hex");
    res.redirect("/");
  } catch (error) {
    next(error);
  }
}

export function logout(req, res, next) {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("connect.sid");
    res.redirect("/login");
  });
}
