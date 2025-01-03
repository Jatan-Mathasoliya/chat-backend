import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import http from "http";

// Models
import User from "./models/User.js";
import Message from "./models/Message.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    console.error("Error stack trace:", err.stack);
  });

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

// Routes
// Signup Route
app.post("/api/signup", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const user = new User({ email, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: "User created successfully." });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error creating user.", error });
  }
});

// Login Route
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({ message: "User not found." });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return res.status(401).json({ message: "Invalid password." });
  }

  const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "1h" });
  res.status(200).json({ token, userId: user._id });
});

// Get All Users
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 }); // Exclude passwords
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// Get Messages
app.get("/api/messages/:from/:to", async (req, res) => {
  const { from, to } = req.params;

  try {
    const messages = await Message.find({
      $or: [
        { sender: from, receiver: to },
        { sender: to, receiver: from },
      ],
    }).sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ message: "Error fetching messages." });
  }
});

// Save Message (Optional: Not needed if using Socket.IO to save messages)
app.post("/api/messages", async (req, res) => {
  const { sender, receiver, content } = req.body;

  try {
    const message = new Message({ sender, receiver, content });
    await message.save();
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ message: "Error saving message." });
  }
});

// Socket.IO for Real-Time Chat
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Update this to your client URL in production
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("New user connected");

  // Listen for join-room event with userId
  socket.on("join-room", (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined their room`);
  });

  // Listen for send-message event
  socket.on("send-message", async (data) => {
    const { sender, receiver, content } = data;
    console.log("Received send-message:", data);

    try {
      const message = new Message({ sender, receiver, content });
      await message.save();
      console.log("Message saved:", message);

      // Emit message to receiver's room
      io.to(receiver).emit("receive-message", {
        sender,
        content,
        createdAt: message.createdAt,
      });
      console.log(`Message emitted to ${receiver}`);
    } catch (error) {
      console.error("Error saving message:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
