// index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

// Cấu hình Socket.io, cho phép mọi nguồn (cors: *) để tránh lỗi kết nối từ Client
const io = new Server(server, {
	cors: {
		origin: "*",
		methods: ["GET", "POST"],
	},
});

io.on("connection", (socket) => {
	console.log(`User Connected: ${socket.id}`);

	// 1. Khi client muốn tham gia vào 1 room (phòng chat/call)
	socket.on("join_room", (roomId) => {
		socket.join(roomId);
		console.log(`User ${socket.id} joined room: ${roomId}`);
		// Thông báo cho người khác trong phòng là có người mới vào
		socket.to(roomId).emit("user_connected", socket.id);
	});

	// 2. Chuyển tiếp tín hiệu (Offer, Answer, ICE Candidate)
	// data bao gồm: { roomId, signalData, targetId }
	socket.on("send_signal", (data) => {
		socket.to(data.roomId).emit("receive_signal", {
			signal: data.signalData,
			from: socket.id,
		});
	});

	// 3. Xử lý ngắt kết nối
	socket.on("disconnect", () => {
		console.log("User Disconnected", socket.id);
		// Có thể bắn event báo cho room biết user đã thoát
		socket.broadcast.emit("user_disconnected", socket.id);
	});
});

// Railway tự động cung cấp biến PORT, nếu chạy local thì dùng 3001
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
	console.log(`Signaling Server running on port ${PORT}`);
});
