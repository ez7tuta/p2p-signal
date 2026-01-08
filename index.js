const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

// Lưu trữ các subscription: { socket_id: { sub_id: filters } }
const subs = new Map();

console.log(`Nostr Relay is running on port ${PORT}`);

wss.on("connection", (ws) => {
  // Tạo ID tạm cho client để quản lý
  ws.id = Math.random().toString(36).substring(7);
  subs.set(ws.id, new Map());

  console.log(`Client connected: ${ws.id}`);

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      // Nostr message luôn là mảng: ["CMD", ...]
      const cmd = data[0];

      if (cmd === "EVENT") {
        handleEvent(ws, data[1]);
      } else if (cmd === "REQ") {
        handleReq(ws, data[1], data[2]); // data[2] là filter
      } else if (cmd === "CLOSE") {
        handleClose(ws, data[1]);
      }
    } catch (e) {
      console.error("Error parsing message:", e);
    }
  });

  ws.on("close", () => {
    console.log(`Client disconnected: ${ws.id}`);
    subs.delete(ws.id);
  });
});

// Xử lý khi nhận Event (Tin nhắn/Signal)
function handleEvent(senderWs, event) {
  // Gửi phản hồi OK (NIP-20)
  senderWs.send(JSON.stringify(["OK", event.id, true, "saved"]));

  // Broadcast cho các client khác đang Subscribe cái này
  // Logic đơn giản: Nếu filter match (ví dụ cùng tags 'p' hoặc 'pubkey'), thì gửi.
  // Với P2P signal, ta thường filter theo 'p' (pubkey người nhận)

  wss.clients.forEach((client) => {
    if (client.readyState === 1 && client.id !== senderWs.id) {
      const clientSubs = subs.get(client.id);
      if (!clientSubs) return;

      clientSubs.forEach((filters, subId) => {
        if (matchFilters(filters, event)) {
          client.send(JSON.stringify(["EVENT", subId, event]));
        }
      });
    }
  });
}

// Xử lý khi Client đăng ký nhận tin (Subscribe)
function handleReq(ws, subId, filters) {
  const clientSubs = subs.get(ws.id);
  clientSubs.set(subId, filters);
  // Gửi EOSE (End of Stored Events) báo là chưa có tin cũ nào (vì in-memory)
  ws.send(JSON.stringify(["EOSE", subId]));
}

// Xử lý hủy đăng ký
function handleClose(ws, subId) {
  const clientSubs = subs.get(ws.id);
  if (clientSubs) clientSubs.delete(subId);
}

// Hàm kiểm tra xem Event có khớp Filter không (Logic cốt lõi của Nostr)
function matchFilters(filters, event) {
  // filters là object, vd: { kinds: [1], authors: ["..."], "#p": ["..."] }
  // Ở đây ta làm đơn giản logic check authors và tags cho signaling

  // 1. Check kinds
  if (filters.kinds && !filters.kinds.includes(event.kind)) return false;

  // 2. Check authors (pubkeys)
  if (filters.authors && !filters.authors.includes(event.pubkey)) return false;

  // 3. Check tags (quan trọng cho P2P: filter theo tag #p - người nhận)
  // tag p: ["p", "pubkey_nguoi_nhan"]
  if (filters["#p"]) {
    const pTags = event.tags.filter((t) => t[0] === "p").map((t) => t[1]);
    const match = pTags.some((p) => filters["#p"].includes(p));
    if (!match) return false;
  }

  return true; // Tạm thời return true nếu qua các bước trên, hoặc filter rỗng
}
