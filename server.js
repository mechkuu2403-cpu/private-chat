const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const PORT = process.env.PORT || 3000;
const ROOM_CODE = "592007";

// Temporary rooms.
// Messages are NOT saved in a database.
const rooms = new Map();

app.use(express.static("public"));

app.get("/health", (req, res) => {
  res.json({
    status: "online",
    service: "private-chat"
  });
});

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("join-room", ({ code, name }) => {
    if (code !== ROOM_CODE) {
      socket.emit("join-error", "Wrong room code.");
      return;
    }

    if (!name || typeof name !== "string") {
      socket.emit("join-error", "Please enter your name.");
      return;
    }

    const cleanName = name.trim().slice(0, 30);

    if (!cleanName) {
      socket.emit("join-error", "Please enter your name.");
      return;
    }

    if (!rooms.has(ROOM_CODE)) {
      rooms.set(ROOM_CODE, new Map());
    }

    const room = rooms.get(ROOM_CODE);

    // Maximum 2 people
    if (room.size >= 2 && !room.has(socket.id)) {
      socket.emit("join-error", "Room is full.");
      return;
    }

    socket.join(ROOM_CODE);

    room.set(socket.id, {
      name: cleanName,
      joinedAt: Date.now()
    });

    socket.data.room = ROOM_CODE;
    socket.data.name = cleanName;

    // Tell the user their own information
    socket.emit("joined", {
      name: cleanName,
      roomCode: ROOM_CODE
    });

    // Send current users to everyone
    sendUsers();

    // Tell the other person that someone joined
    socket.to(ROOM_CODE).emit("user-joined", {
      name: cleanName
    });

    console.log(`${cleanName} joined the room`);
  });

  // Text/image/file message relay
  socket.on("send-message", (message) => {
    if (!socket.data.room) return;

    const room = rooms.get(socket.data.room);
    if (!room || !room.has(socket.id)) return;

    const messageData = {
      id: message?.id || `${Date.now()}-${Math.random()}`,
      type: message?.type || "text",
      text: typeof message?.text === "string"
        ? message.text.slice(0, 10000)
        : "",
      fileName: message?.fileName || null,
      fileType: message?.fileType || null,
      fileData: message?.fileData || null,
      reply: message?.reply || null,
      time: Date.now(),
      senderId: socket.id,
      senderName: socket.data.name
    };

    // Send to everyone in room, including sender
    io.to(socket.data.room).emit("new-message", messageData);
  });

  // Typing indicator
  socket.on("typing", (isTyping) => {
    if (!socket.data.room) return;

    socket.to(socket.data.room).emit("typing", {
      name: socket.data.name,
      typing: Boolean(isTyping)
    });
  });

  // Delivered status
  socket.on("message-delivered", ({ messageId }) => {
    if (!socket.data.room) return;

    socket.to(socket.data.room).emit("message-delivered", {
      messageId
    });
  });

  // Read status
  socket.on("message-read", ({ messageId }) => {
    if (!socket.data.room) return;

    socket.to(socket.data.room).emit("message-read", {
      messageId
    });
  });

  // User requests current room status
  socket.on("get-users", () => {
    sendUsers();
  });

  function sendUsers() {
    const room = rooms.get(ROOM_CODE);

    if (!room) {
      socket.emit("room-users", []);
      return;
    }

    const users = [...room.entries()].map(([id, user]) => ({
      id,
      name: user.name,
      online: true
    }));

    io.to(ROOM_CODE).emit("room-users", users);
  }

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);

    const roomCode = socket.data.room;

    if (!roomCode || !rooms.has(roomCode)) return;

    const room = rooms.get(roomCode);

    room.delete(socket.id);

    if (room.size === 0) {
      // Delete the room completely.
      // Nothing is stored permanently.
      rooms.delete(roomCode);
    } else {
      io.to(roomCode).emit("user-left", {
        name: socket.data.name
      });

      sendUsers();
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
