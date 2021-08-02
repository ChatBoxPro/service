const app = require("express")();
const http = require("http").Server(app);
// const io = require("socket.io")(http);
const io = require("socket.io")(http, {
  cors: {
    origin: "http://localhost:3000",
  },
});
const port = process.env.PORT || 5000;

//
let activeClients = [];
let sockets = [];

function idGenerator(length) {
  let result = "";
  let characters = "123456789";
  let charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

function getClientId() {
  const length = 6;
  let id = idGenerator(length);
  do {
    id = idGenerator(length);
  } while (
    activeClients
      .map((activeClient) => {
        return activeClient.clientId;
      })
      .indexOf(id) > -1
  );
  return id;
}

function addNewClient(socket) {
  const clientId = getClientId();
  const roomName = "WaitingRoom";
  const clientObject = {
    socket,
    socketId: socket.id,
    clientId,
    roomName,
  };
  activeClients.push(clientObject);
  return clientId;
}

function isConnectionActive(clientId) {
  return activeClients.some((activeClient) => {
    return activeClient.clientId === clientId;
  });
}

function isConnectionActiveAndWaiting(clientId) {
  return activeClients.some((activeClient) => {
    return (
      activeClient.clientId === clientId &&
      activeClient.roomName === "WaitingRoom"
    );
  });
}

function connectTwoClients(clientSocketId, connectionId) {
  let newRoomName = connectionId + new Date().getTime().toString(36);
  activeClients.map((activeClient) => {
    if (
      activeClient.clientId === connectionId ||
      activeClient.socketId === clientSocketId
    ) {
      activeClient.roomName = newRoomName;
    }
  });
  return newRoomName;
}

function getRoomNameOfClientBySocketId(socketId) {
  let room;
  activeClients.map((activeClient) => {
    if (activeClient.socketId === socketId) {
      room = activeClient.roomName;
    }
  });
  if (!!room && room != "WaitingRoom") {
    return room;
  } else {
    return "Room Not Found!";
  }
}

function getSocketsAndResetRoomNameOfConnectedClients(roomName) {
  let socketsArray = [];
  activeClients.map((activeClient) => {
    if (activeClient.roomName === roomName) {
      activeClient.roomName = "WaitingRoom";
      socketsArray.push(activeClients.socket);
    }
  });
  return socketsArray;
}

function disconnectTwoClients(data) {
  activeClients.map((activeClient) => {
    if (
      (activeClient.clientId === data.clientId &&
        activeClient.roomName === data.roomName) ||
      (activeClient.clientId === data.connectionId &&
        activeClient.roomName === data.roomName)
    ) {
      activeClient.roomName = "WaitingRoom";
    }
  });
}

function selfConnectCheck(socketId, connectionId) {
  return activeClients.some((activeClient) => {
    return (
      activeClient.socketId === socketId &&
      activeClient.clientId === connectionId
    );
  });
}

io.on("connection", (socket) => {
  sockets.push(socket);
  // Client Connects
  const clientId = addNewClient(socket);
  socket.emit("client-id-from-server", clientId);

  // Client disconnects
  socket.on("disconnect", () => {
    const roomName = getRoomNameOfClientBySocketId(socket.id);
    socket.to(roomName).emit("goodbye");
    const socketsArray = getSocketsAndResetRoomNameOfConnectedClients(roomName);
    socketsArray.map((socket) => {
      if (!!socket) {
        socket.leave(roomName);
      }
    });
  });

  // Client sends message
  socket.on("send-message", (messageDetails) => {
    socket
      .to(messageDetails.roomName)
      .emit("receive-message", messageDetails.message);
  });

  socket.on("goodbye", (disconnectionDetails) => {
    disconnectTwoClients(disconnectionDetails);
    socket.to(disconnectionDetails.roomName).emit("goodbye");
  });

  // Client tries to connect with someone.
  socket.on("join", (connectionId) => {
    if (!selfConnectCheck(socket.id, connectionId)) {
      if (isConnectionActive(connectionId)) {
        if (isConnectionActiveAndWaiting(connectionId)) {
          const newRoomName = connectTwoClients(socket.id, connectionId);
          if (!!newRoomName) {
            //
            let activeClientIndex = activeClients.findIndex(
              (activeClient) => activeClient.clientId == connectionId
            );
            let socketObjectOfConnection =
              activeClients[activeClientIndex].socket;
            // Adding both clients to a new room.
            socketObjectOfConnection.join(newRoomName);
            socket.join(newRoomName);
            //
            socket.emit("connection-details", {
              status: true,
              connectionId,
              chatRoom: newRoomName,
            });
            socketObjectOfConnection.emit("somebody-connected-with-you", {
              status: true,
              connectionId: clientId,
              chatRoom: newRoomName,
            });
          }
        } else {
          socket.emit("connection-details", {
            status: false,
            message: `Ahh, looks like ID ${connectionId} is active but connected with somebody else!`,
          });
        }
      } else {
        socket.emit("connection-details", {
          status: false,
          message: `Oops, found nobody with ID ${connectionId}. Please try later!`,
        });
      }
    } else {
      socket.emit("connection-details", {
        status: false,
        message: `You don't need a chatbox to connect with yourself. Just pay attention to your thoughts! :)`,
      });
    }
  });
});

http.listen(port, () => {
  console.log(`Socket.IO server running at http://localhost:${port}/`);
});
