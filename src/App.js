import "./App.css";
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import db from "./firebase";
import { useEffect, useRef, useState } from "react";
import moment from "moment";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { Button, Modal, Tooltip } from "antd";
import Input from "antd/lib/input/Input";

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

function App() {
  const [disabledCreate, setDisabledCreate] = useState(false);

  const [disabledJoin, setDisabledJoin] = useState(false);

  const [disabledHang, setDisabledHang] = useState(true);

  const [localStream, setLocalStream] = useState(null);

  const [roomLink, setRoomLink] = useState("");

  const [listMessages, setListMessages] = useState([]);

  const [name, setName] = useState("");

  const [displayName, setDisplayName] = useState("");

  const [displayNameRemote, setDisplayNameRemote] = useState("");

  const [message, setMessage] = useState("");

  const inputRef = useRef();

  const remoteVideo = useRef();

  const [chatRoom, setChatRoom] = useState("");

  const [sending, setSending] = useState(false);

  const [isOpenIncoming, setIsOpenIncoming] = useState(false);

  const pickupRef = useRef();

  const [incomingName, setIncomingName] = useState("");

  const [status, setStatus] = useState("");

  const [camDevice, setCamDevice] = useState("environment");

  // const [roomIdTemp, setRoomIdTemp] = useState("");

  const handleCopy = (text) => {
    const dummy = document.createElement("textarea");
    document.body.appendChild(dummy);
    dummy.value = text;
    dummy.select();
    document.execCommand("copy");
    document.body.removeChild(dummy);
  };

  async function createRoom() {
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

    const roomWithOffer = {
      offer: {
        type: offer.type,
        sdp: offer.sdp,
        name: name,
        time: moment().utc().format(),
      },
    };

    setDisplayName();

    await roomRef.set(roomWithOffer);
    await roomRef.update({
      status: { name: "new", time: moment().utc().format() },
    });

    setRoomLink(roomRef.id);

    peerConnection.addEventListener("track", (event) => {
      console.log("Got remote track:", event.streams[0]);
      console.log(1);
      event.streams[0].getTracks().forEach((track) => {
        console.log("Add a track to the remoteStream:", track);
        remoteStream?.addTrack(track);
      });
    });

    // Listening for remote session description below
    roomRef.onSnapshot(async (snapshot) => {
      const data = snapshot.data();
      if (!peerConnection.currentRemoteDescription && data && data.answer) {
        setIsOpenIncoming(true);
        setIncomingName(data.answer?.name);
        // console.log(2);
        document
          .getElementById("pickup-temp-button")
          .addEventListener("click", async (event) => {
            setDisplayName(data.offer?.name);
            setDisplayNameRemote(data.answer?.name);
            const rtcSessionDescription = new RTCSessionDescription(
              data.answer
            );
            await peerConnection.setRemoteDescription(rtcSessionDescription);
            roomRef.collection("calleeCandidates").onSnapshot((snapshot) => {
              snapshot.docChanges().forEach(async (change) => {
                if (change.type === "added") {
                  console.log(3);
                  let data = change.doc.data();
                  console.log(
                    `Got new remote ICE candidate: ${JSON.stringify(data)}`
                  );
                  await peerConnection.addIceCandidate(
                    new RTCIceCandidate(data)
                  );
                }
              });
            });
            await roomRef.update({
              status: { name: "connected", time: moment().utc().format() },
            });

            setChatRoom(roomRef.id);
            setDisabledCreate(true);
            setDisabledJoin(true);
            setDisabledHang(false);

            setIsOpenIncoming(false);
          });
        document
          .getElementById("decline-temp-button")
          .addEventListener("click", async (event) => {
            setIsOpenIncoming(false);
            setStatus("");
          });
      }
    });
    // Listening for remote session description above

    // Listen for remote ICE candidates below
  }

  async function openUserMedia(e) {
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

    document.getElementById("remoteVideo").srcObject = null;

    // setDisabledCamera(false);
    setDisabledJoin(false);
    setDisabledCreate(false);
    setDisabledHang(true);
    // document.getElementById("currentRoom").innerText = "";

    // Delete room on hangup
    if (roomLink) {
      const db = firebase.firestore();
      const roomRef = db.collection("rooms").doc(roomLink);
      // const calleeCandidates = await roomRef
      //   .collection("calleeCandidates")
      //   .get();
      // calleeCandidates.forEach(async (candidate) => {
      //   await candidate.delete();
      // });
      // const callerCandidates = await roomRef
      //   .collection("callerCandidates")
      //   .get();
      // callerCandidates.forEach(async (callerCandidate) => {
      //   await callerCandidate?.delete();
      // });
      await roomRef
        .update({
          status: { name: "disconnected", time: moment().utc().format() },
        })
        .finally(() => {
          window.location.reload();
        });
    }
  }

  function registerPeerConnectionListeners() {
    peerConnection.addEventListener("icegatheringstatechange", () => {
      console.log(
        `ICE gathering state changed: ${peerConnection.iceGatheringState}`
      );
    });

    peerConnection.addEventListener("connectionstatechange", () => {
      console.log(`Connection state change: ${peerConnection.connectionState}`);
      setStatus(peerConnection.connectionState);
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

  async function onSendMessage() {
    setSending(true);
    const roomRef = db.collection("messages").doc(chatRoom);

    const docSnap = await getDoc(doc(db, "messages", chatRoom));

    peerConnection = new RTCPeerConnection(configuration);

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
        setSending(false);
      });
    } else {
      await roomRef.set(messageDetail).then(() => {
        setMessage("");
        setSending(false);
      });
      setChatRoom(roomRef.id);
    }
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
  }, []);

  useEffect(() => {
    handleListenMessages();
  }, [chatRoom]);

  useEffect(() => {
    document.getElementById("chat-area").scroll({
      top: listMessages?.length * 80,
      behavior: "smooth",
    });
  }, [listMessages]);

  window.addEventListener("beforeunload", function (e) {
    hangUp();
  });

  const supports = navigator.mediaDevices.getSupportedConstraints();
  if (!supports["facingMode"]) {
    alert("Browser Not supported!");
    return;
  }

  let stream;

  const capture = async (facingMode) => {
    const options = {
      audio: false,
      video: {
        facingMode,
      },
    };

    try {
      if (stream) {
        const tracks = stream.getTracks();
        tracks.forEach((track) => track.stop());
      }
      stream = await navigator.mediaDevices.getUserMedia(options);
    } catch (e) {
      alert(e);
      return;
    }
    document.getElementById("localVideo").srcObject.srcObject = null;
    document.getElementById("localVideo").srcObject.srcObject = stream;
    document.getElementById("localVideo").srcObject.play();
  };

  // btnBack.addEventListener('click', () => {
  //   capture('environment');
  // });

  // btnFront.addEventListener('click', () => {
  //   capture('user');
  // });

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 15, justifyContent: "center" }}>
        <h1>Hello {name}</h1>
      </div>
      <div
        id="buttons"
        style={{ gap: 10, display: "flex", justifyContent: "center" }}
      >
        <Button
          type="primary"
          disabled={disabledCreate}
          onClick={() => createRoom()}
        >
          <span className="mdc-button__label">Request support</span>
        </Button>
        {/* <span style={{ marginTop: 4 }}>or</span>
        <div style={{ display: "flex" }}>
          <Input placeholder="Enter partner's room id" id="room-id-input" />
          <Button
            disabled={disabledJoin}
            type="secondary"
            // id="joinBtn"
            onClick={() =>
              joinRoom(document.getElementById("room-id-input")?.value || "")
            }
          >
            <span className="mdc-Button__label">Join room</span>
          </Button>
        </div> */}
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
      <div id="videos" style={{ display: "flex", gap: 10, width: "100%" }}>
        <div
          style={{
            flex: 1,
            backgroundColor: "white",
            display: "flex",
            flexDirection: "column",
            placeItems: "center",
          }}
        >
          {displayName && <p>{displayName} (You)</p>}
          <video
            style={{ width: "100%", transform: "rotateY(180deg)" }}
            id="localVideo"
            muted
            autoPlay
            playsInline
          ></video>
          <Button
            onClick={() =>
              capture(camDevice === "environment" ? "user" : "environment")
            }
          >
            Switch
          </Button>
          <Button
            type="danger"
            disabled={disabledHang}
            onClick={() => hangUp()}
            id="hangupBtn"
            style={{ width: "150px", marginTop: 20 }}
          >
            <span className="mdc-Button__label">End call</span>
          </Button>
        </div>
        <div style={{ flex: 1, backgroundColor: "white" }}>
          {status === "connecting" && (
            <p style={{ textAlign: "center" }}>
              Connecting with {displayNameRemote}
            </p>
          )}

          <>
            {status === "connected" && displayNameRemote && (
              <p style={{ textAlign: "center" }}>{displayNameRemote}</p>
            )}
            <video
              style={{ width: "100%", transform: "rotateY(180deg)" }}
              ref={status === "connected" ? remoteVideo : null}
              id="remoteVideo"
              muted
              autoPlay
              playsInline
            ></video>
          </>
          {status === "disconnected" &&
            `${displayNameRemote} has hang up the call!`}
        </div>
      </div>
      <hr />
      <div
        style={{
          marginTop: "20px",
          width: "100%",
          height: "400px",
          overflow: "auto",
          position: "relative",
          padding: "10px",
          display: !chatRoom && "none",
        }}
      >
        <div
          id="chat-area"
          style={{
            flexDirection: "column",
            display: "flex",
            height: 350,
            overflowY: "auto",
            backgroundColor: "#fff",
            padding: 20,
          }}
        >
          {listMessages.map((item) => {
            return (
              <div style={{ width: "100%" }}>
                <div
                  style={{
                    width: "fit-content",
                    marginBottom: "10px",
                    float: item.name === name ? "right" : "left",
                  }}
                >
                  <p
                    style={{
                      fontWeight: "bold",
                      marginBottom: "5px",
                      textAlign: item.name === name ? "right" : "left",
                    }}
                  >
                    {item?.name}
                  </p>
                  <Tooltip
                    placement="left"
                    title={moment(item?.time).format("HH:ss")}
                  >
                    <div
                      style={{
                        border: "1px solid #ccc",
                        borderRadius: "8px",
                        textAlign: item.name === name ? "right" : "left",
                        padding: 10,
                        width: "fit-content",
                        marginLeft: item.name === name ? "auto" : "0px",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      {item?.message}
                    </div>
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: "10px",
            width: "calc(100% - 20px)",
            height: 40,
            gap: 10,
          }}
        >
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value ?? "")}
            style={{ flex: 1, paddingLeft: "10px" }}
            ref={inputRef}
            placeholder="Type a message"
            onPressEnter={(e) =>
              !sending && onSendMessage(e.target?.value || "")
            }
          />
          <div style={{ display: " flex", gap: 8 }}>
            <Button style={{ width: "150px", height: "100%" }}>Attach</Button>
            <Button
              disabled={!message}
              style={{ width: "150px", height: "100%" }}
              onClick={() => onSendMessage(message)}
              loading={sending}
            >
              Send
            </Button>
          </div>
        </div>
        <div style={{ position: "absolute", top: 0, zIndex: "-1" }}>
          <button
            id="pickup-temp-button"
            // onClick={() => onAnswerCall()}
          ></button>
          <button
            id="decline-temp-button"
            // onClick={() => onDeclineCall()}
          ></button>
        </div>
      </div>
      <Modal
        title="Vui lòng nhập tên"
        closable={false}
        open={name === ""}
        footer={
          <div>
            <Button
              type="primary"
              onClick={() =>
                setName(document.getElementById("name-ref")?.value || "")
              }
            >
              Confirm
            </Button>
          </div>
        }
      >
        <div>
          <Input style={{ fontSize: "16px" }} id="name-ref" />
        </div>
      </Modal>
      <Modal
        title={`${incomingName} is waiting to connect ...`}
        closable={false}
        open={isOpenIncoming}
        footer={null}
      >
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button
            ref={pickupRef}
            onClick={() =>
              document.getElementById("pickup-temp-button")?.click()
            }
            type="primary"
          >
            Pick up
          </Button>
          <Button
            type="danger"
            onClick={() =>
              document.getElementById("decline-temp-button")?.click()
            }
          >
            Decline
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export default App;
