const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server);

const PORT = process.env.PORT || 3000;
const ROOM_CODE = "592007";

const rooms = new Map();

app.use(express.static("public"));

app.get("/health", (req, res) => {
    res.send("Private Chat Server Online");
});

io.on("connection", (socket) => {

    console.log("CONNECTED:", socket.id);

    socket.on("join-room", (data) => {

        const code = String(data?.code || "").trim();
        const name = String(data?.name || "").trim();

        console.log("JOIN REQUEST:", socket.id, code, name);

        if (code !== ROOM_CODE) {
            socket.emit("join-error", "Wrong room code.");
            return;
        }

        if (!name) {
            socket.emit("join-error", "Name required.");
            return;
        }

        if (!rooms.has(ROOM_CODE)) {
            rooms.set(ROOM_CODE, new Map());
        }

        const room = rooms.get(ROOM_CODE);

        if (room.size >= 2 && !room.has(socket.id)) {
            socket.emit("join-error", "Room already has 2 people.");
            return;
        }

        socket.join(ROOM_CODE);

        room.set(socket.id, {
            name: name.substring(0, 30),
            online: true
        });

        socket.data.room = ROOM_CODE;
        socket.data.name = name.substring(0, 30);

        socket.emit("joined", {
            name: socket.data.name
        });

        updateUsers();

        console.log(
            "ROOM USERS:",
            [...room.values()].map(u => u.name)
        );
    });

    function updateUsers() {

        const room = rooms.get(ROOM_CODE);

        if (!room) return;

        const users = [];

        for (const [id, user] of room.entries()) {
            users.push({
                id: id,
                name: user.name,
                online: true
            });
        }

        io.to(ROOM_CODE).emit("room-users", users);
    }

    socket.on("send-message", (message) => {

        if (!socket.data.room) return;

        const room = rooms.get(socket.data.room);

        if (!room || !room.has(socket.id)) return;

        const msg = {
            id: message.id,
            type: message.type || "text",
            text: message.text || "",
            fileName: message.fileName || null,
            fileType: message.fileType || null,
            fileData: message.fileData || null,
            reply: message.reply || null,
            time: Date.now(),
            senderId: socket.id,
            senderName: socket.data.name
        };

        io.to(socket.data.room).emit("new-message", msg);
    });

    socket.on("typing", (typing) => {

        if (!socket.data.room) return;

        socket.to(socket.data.room).emit("typing", {
            name: socket.data.name,
            typing: !!typing
        });
    });

    socket.on("message-delivered", (data) => {

        if (!socket.data.room) return;

        socket.to(socket.data.room).emit(
            "message-delivered",
            data
        );
    });

    socket.on("message-read", (data) => {

        if (!socket.data.room) return;

        socket.to(socket.data.room).emit(
            "message-read",
            data
        );
    });

    socket.on("disconnect", () => {

        console.log("DISCONNECTED:", socket.id);

        const roomCode = socket.data.room;

        if (!roomCode) return;

        const room = rooms.get(roomCode);

        if (!room) return;

        room.delete(socket.id);

        if (room.size === 0) {
            rooms.delete(roomCode);
            console.log("ROOM DELETED");
        } else {
            updateUsers();
        }
    });
});

server.listen(PORT, () => {
    console.log("SERVER RUNNING ON PORT:", PORT);
});
