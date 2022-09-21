import "./App.css";
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import db from "./firebase";
import { useEffect, useRef, useState } from "react";
import { MDCDialog } from "@material/dialog";
import { useLocation } from "react-router-dom";
import moment from "moment";
import { doc, setDoc, getDoc } from "firebase/firestore";

const configuration = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 10,
};
let remoteStream = null;

let peerConnection = null;
let roomDialog = null;
let roomId = null;
function App() {
  const [disabledCreate, setDisabledCreate] = useState(true);

  const [disabledJoin, setDisabledJoin] = useState(true);

  const [disabledHang, setDisabledHang] = useState(true);

  const [disabledCamera, setDisabledCamera] = useState(false);

  const [localStream, setLocalStream] = useState(null);

  const [roomLink, setRoomLink] = useState("");

  const [listMessages, setListMessages] = useState([]);

  const [name, setName] = useState("");

  const [nameTemp, setNameTemp] = useState("");

  const [message, setMessage] = useState("");

  const inputRef = useRef();

  const remoteVideo = useRef();

  const [chatRoom, setChatRoom] = useState("");

  const location = useLocation();

  const handleCopy = (text) => {
    const dummy = document.createElement("textarea");
    document.body.appendChild(dummy);
    dummy.value = text;
    dummy.select();
    document.execCommand("copy");
    document.body.removeChild(dummy);
  };

  async function createRoom() {
    setDisabledCreate(true);
    setDisabledJoin(true);

    const roomRef = await db.collection("rooms").doc();

    console.log("Create PeerConnection with configuration: ", configuration);
    peerConnection = new RTCPeerConnection(configuration);

    registerPeerConnectionListeners();

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    // Code for collecting ICE candidates below
    const callerCandidatesCollection = roomRef.collection("callerCandidates");

    peerConnection.addEventListener("icecandidate", (event) => {
      if (!event.candidate) {
        console.log("Got final candidate!");
        return;
      }
      console.log("Got candidate: ", event.candidate);
      callerCandidatesCollection.add(event.candidate.toJSON());
    });
    // Code for collecting ICE candidates above

    // Code for creating a room below
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    console.log("Created offer:", offer);

    const roomWithOffer = {
      offer: {
        type: offer.type,
        sdp: offer.sdp,
      },
    };

    await roomRef.set(roomWithOffer);

    // roomId = roomRef.id;

    console.log(`New room created with SDP offer. Room ID: ${roomRef.id}`);

    setRoomLink(roomRef.id);
    // Code for creating a room above

    peerConnection.addEventListener("track", (event) => {
      console.log("Got remote track:", event.streams[0]);
      event.streams[0].getTracks().forEach((track) => {
        console.log("Add a track to the remoteStream:", track);
        remoteStream?.addTrack(track);
      });
    });

    // Listening for remote session description below
    roomRef.onSnapshot(async (snapshot) => {
      const data = snapshot.data();
      if (!peerConnection.currentRemoteDescription && data && data.answer) {
        console.log("Got remote description: ", data.answer);
        const rtcSessionDescription = new RTCSessionDescription(data.answer);
        await peerConnection.setRemoteDescription(rtcSessionDescription);
      }
    });
    // Listening for remote session description above

    // Listen for remote ICE candidates below
    roomRef.collection("calleeCandidates").onSnapshot((snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
          let data = change.doc.data();
          console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
          await peerConnection.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });

    setChatRoom(roomRef.id);

    // Listen for remote ICE candidates above
  }

  function joinRoom() {
    roomDialog = new MDCDialog(document.getElementById("room-dialog"));

    setDisabledCreate(true);
    setDisabledJoin(true);

    document.getElementById("confirmJoinBtn").addEventListener(
      "click",
      async () => {
        roomId = document.getElementById("room-id").value;
        console.log("Join room: ", roomId);
        setRoomLink("Đang trong cuộc gọi ");
        await joinRoomById(roomId);
      },
      { once: true }
    );
    roomDialog.open();
  }

  async function joinRoomById(roomId) {
    const db = firebase.firestore();
    const roomRef = db.collection("rooms").doc(`${roomId}`);
    const roomSnapshot = await roomRef.get();
    // console.log("Got room:", roomSnapshot.exists);

    setChatRoom(roomId);

    if (roomSnapshot.exists) {
      console.log("Create PeerConnection with configuration: ", configuration);
      peerConnection = new RTCPeerConnection(configuration);
      registerPeerConnectionListeners();
      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });

      // Code for collecting ICE candidates below
      const calleeCandidatesCollection = roomRef.collection("calleeCandidates");
      peerConnection.addEventListener("icecandidate", (event) => {
        if (!event.candidate) {
          console.log("Got final candidate!");
          return;
        }
        console.log("Got candidate: ", event.candidate);
        calleeCandidatesCollection.add(event.candidate.toJSON());
      });
      // Code for collecting ICE candidates above

      peerConnection.addEventListener("track", (event) => {
        console.log("Got remote track:", event.streams[0]);
        event.streams[0].getTracks().forEach((track) => {
          console.log("Add a track to the remoteStream:", track);
          remoteStream?.addTrack(track);
          if (remoteVideo.current && "srcObject" in remoteVideo.current) {
            remoteVideo.current.srcObject = remoteStream;
          }
        });
      });

      // Code for creating SDP answer below
      const offer = roomSnapshot.data().offer;
      console.log("Got offer:", offer);
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      const answer = await peerConnection.createAnswer();
      console.log("Created answer:", answer);
      await peerConnection.setLocalDescription(answer);

      const roomWithAnswer = {
        answer: {
          type: answer.type,
          sdp: answer.sdp,
        },
      };
      await roomRef.update(roomWithAnswer);
      // Code for creating SDP answer above

      // Listening for remote ICE candidates below
      roomRef.collection("callerCandidates").onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === "added") {
            let data = change.doc.data();
            console.log(
              `Got new remote ICE candidate: ${JSON.stringify(data)}`
            );
            await peerConnection.addIceCandidate(new RTCIceCandidate(data));
          }
        });
      });
      // Listening for remote ICE candidates above
    }
  }

  async function openUserMedia(e) {
    // const stream = await navigator.mediaDevices.getUserMedia({
    //   video: true,
    //   audio: true,
    // });
    // document.getElementById("localVideo").srcObject = stream;
    // setLocalStream(stream);

    // remoteStream = new MediaStream();
    // document.getElementById("remoteVideo").srcObject = remoteStream;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    document.getElementById("localVideo").srcObject = stream;
    setLocalStream(stream);
    remoteStream = new MediaStream();
    document.getElementById("remoteVideo").srcObject = remoteStream;

    setDisabledCreate(false);
    setDisabledJoin(false);
    setDisabledHang(false);
    setDisabledCamera(true);
  }

  async function hangUp(e) {
    const tracks = document.querySelector("#localVideo").srcObject.getTracks();
    tracks.forEach((track) => {
      track.stop();
    });

    if (remoteStream) {
      remoteStream.getTracks().forEach((track) => track.stop());
    }

    if (peerConnection) {
      peerConnection.close();
    }

    document.getElementById("localVideo").srcObject = null;

    document.getElementById("remoteVideo").srcObject = null;

    setDisabledCamera(false);
    setDisabledJoin(true);
    setDisabledCreate(true);
    setDisabledHang(true);
    document.getElementById("currentRoom").innerText = "";

    // Delete room on hangup
    if (roomId) {
      const db = firebase.firestore();
      const roomRef = db.collection("rooms").doc(roomId);
      const calleeCandidates = await roomRef
        .collection("calleeCandidates")
        .get();
      calleeCandidates.forEach(async (candidate) => {
        await candidate.delete();
      });
      const callerCandidates = await roomRef
        .collection("callerCandidates")
        .get();
      callerCandidates.forEach(async (candidate) => {
        await candidate.delete();
      });
      await roomRef.delete();
    }

    document.location.reload(true);
  }

  function registerPeerConnectionListeners() {
    peerConnection.addEventListener("icegatheringstatechange", () => {
      console.log(
        `ICE gathering state changed: ${peerConnection.iceGatheringState}`
      );
    });

    peerConnection.addEventListener("connectionstatechange", () => {
      console.log(`Connection state change: ${peerConnection.connectionState}`);
    });

    peerConnection.addEventListener("signalingstatechange", () => {
      console.log(`Signaling state change: ${peerConnection.signalingState}`);
    });

    peerConnection.addEventListener("iceconnectionstatechange ", () => {
      console.log(
        `ICE connection state change: ${peerConnection.iceConnectionState}`
      );
    });
  }

  // const onSendMessage = async (message) => {
  //   console.log(message);
  // };

  async function onSendMessage() {
    const roomRef = db.collection("messages").doc(chatRoom);

    // roomRef.collection("messages").
    const docSnap = await getDoc(doc(db, "messages", chatRoom));

    peerConnection = new RTCPeerConnection(configuration);

    // Code for collecting ICE candidates above

    // Code for creating a room below
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const messageDetail = {
      message: [
        ...(docSnap.data()?.message ?? []),
        {
          message: message,
          time: moment().utc().format(),
          name: name,
        },
      ],
    };

    if (chatRoom) {
      await setDoc(doc(db, "messages", chatRoom), messageDetail).then(() => {
        setMessage("");
      });
    } else {
      await roomRef.set(messageDetail).then(() => {
        setMessage("");
      });
      setChatRoom(roomRef.id);
    }

    roomRef.collection("messages").onSnapshot((snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
          let data = change.doc.data();
          console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
          await peerConnection.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
  }

  const handleListenMessages = () => {
    if (chatRoom) {
      db.collection("messages")
        .doc(chatRoom)
        .onSnapshot(doc(db, "messages", chatRoom), (doccument) => {
          setListMessages(doccument.data()?.message ?? []);
        });
    }
  };

  useEffect(() => {
    openUserMedia();
    handleListenMessages();
  }, []);

  useEffect(() => {
    handleListenMessages();
  }, [chatRoom]);

  console.log(listMessages);

  return (
    <div className="App">
      <div style={{ display: "flex", gap: 15, justifyContent: "center" }}>
        <h1>Hello</h1>
        {name ? (
          <h1>{name}</h1>
        ) : (
          <div style={{ display: "flex", height: "45px", marginTop: "20px" }}>
            <input
              style={{ fontSize: "25px" }}
              onChange={(e) => setNameTemp(e.target.value)}
            />
            <button onClick={() => setName(nameTemp)}>Đặt tên</button>
          </div>
        )}
      </div>
      <div
        id="buttons"
        style={{ gap: 10, display: "flex", justifyContent: "center" }}
      >
        {/* <button
          className="mdc-button mdc-button--raised"
          onClick={() => openUserMedia()}
          disabled={disabledCamera}
        >
          <i className="material-icons mdc-button__icon" aria-hidden="true">
            perm_camera_mic
          </i>
          <span className="mdc-button__label">Open camera & microphone</span>
        </button> */}
        <button
          className="mdc-button mdc-button--raised"
          disabled={disabledCreate}
          // id="createBtn"
          onClick={() => createRoom()}
        >
          <i className="material-icons mdc-button__icon" aria-hidden="true">
            group_add
          </i>
          <span className="mdc-button__label">Create room</span>
        </button>
        <button
          className="mdc-button mdc-button--raised"
          disabled={disabledJoin}
          id="joinBtn"
          onClick={() => joinRoom()}
        >
          <i className="material-icons mdc-button__icon" aria-hidden="true">
            group
          </i>
          <span className="mdc-button__label">Join room</span>
        </button>
        <button
          className="mdc-button mdc-button--raised"
          disabled={disabledHang}
          onClick={() => hangUp()}
          id="hangupBtn"
        >
          <i className="material-icons mdc-button__icon" aria-hidden="true">
            close
          </i>
          <span className="mdc-button__label">Hangup</span>
        </button>
      </div>
      <div style={{ fontWeight: 600, padding: "20px 20px" }}>
        <span>
          {roomLink ? `Mã phòng: ${roomLink}` : " "}
          {roomLink && !roomLink?.includes("Đang") ? (
            <p
              onClick={() => handleCopy(roomLink)}
              style={{ color: "blue", cursor: "pointer" }}
            >
              Sao chép mã phòng
            </p>
          ) : (
            ""
          )}
        </span>
      </div>
      <div id="videos" style={{ display: "flex", gap: 10, width: "100vw" }}>
        <div style={{ border: "1px solid red", flex: 1 }}>
          <video id="localVideo" muted autoPlay playsInline></video>
        </div>
        <div style={{ border: "1px solid blue", flex: 1 }}>
          <video
            ref={remoteVideo}
            id="remoteVideo"
            autoPlay
            playsInline
          ></video>
        </div>
      </div>
      <div
        className="mdc-dialog"
        id="room-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="my-dialog-title"
        aria-describedby="my-dialog-content"
      >
        <div className="mdc-dialog__container">
          <div className="mdc-dialog__surface">
            <h2 className="mdc-dialog__title" id="my-dialog-title">
              Join room
            </h2>
            <div className="mdc-dialog__content" id="my-dialog-content">
              Enter ID for room to join:
              <div className="mdc-text-field">
                <input
                  type="text"
                  id="room-id"
                  className="mdc-text-field__input"
                />
                <label className="mdc-floating-label" htmlFor="my-text-field">
                  Room ID
                </label>
                <div className="mdc-line-ripple"></div>
              </div>
            </div>
            <footer className="mdc-dialog__actions">
              <button
                type="button"
                className="mdc-button mdc-dialog__button"
                data-mdc-dialog-action="no"
              >
                <span className="mdc-button__label">Cancel</span>
              </button>
              <button
                id="confirmJoinBtn"
                type="button"
                className="mdc-button mdc-dialog__button"
                data-mdc-dialog-action="yes"
              >
                <span className="mdc-button__label">Join</span>
              </button>
            </footer>
          </div>
        </div>
        <div className="mdc-dialog__scrim"></div>
      </div>
      <p style={{ textAlign: "left" }}>
        Messages: <b> {chatRoom} </b>
      </p>
      <div
        style={{
          border: "2px solid #f05a94",
          width: "100%",
          height: "400px",
          overflow: "auto",
          position: "relative",
          padding: "10px",
        }}
      >
        {listMessages.map((item) => {
          return (
            <div style={{ display: "flex" }}>
              <div style={{ width: "100%" }}>
                <div
                  style={{
                    border: "1px solid red",
                    width: "fit-content",
                    marginBottom: "10px",
                    float: item.name === name ? "right" : "left",
                  }}
                >
                  <p style={{ fontWeight: "bold" }}>
                    {item?.name} at
                    {moment(item?.time).format("HH:ss - DD/MM/YYYY")}
                  </p>
                  <div>{item?.message}</div>
                </div>
              </div>
            </div>
          );
        })}
        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: "10px",
            width: "100%",
            height: 40,
          }}
        >
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value ?? "")}
            style={{ width: "100%" }}
            ref={inputRef}
          />
          <button
            disabled={!message}
            style={{ width: "150px" }}
            onClick={() => onSendMessage(message)}
          >
            Gửi
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
