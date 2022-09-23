import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import db from "../../firebase";
import { useEffect, useRef, useState } from "react";
import moment from "moment";
import {
  doc,
  setDoc,
  getDoc,
  query,
  where,
  onSnapshot,
  collection,
} from "firebase/firestore";
import { Button, Modal, Table, Tag, Tooltip } from "antd";
import Input from "antd/lib/input/Input";
import { Link } from "react-router-dom";

// let remoteStream = null;

// let peerConnection = null;

const RequestList = () => {
  const [listRequest, setListRequest] = useState([]);

  // const [mess, setMess] = useState(null);

  // const handleCopy = (text) => {
  //   const dummy = document.createElement("textarea");
  //   document.body.appendChild(dummy);
  //   dummy.value = text;
  //   dummy.select();
  //   document.execCommand("copy");
  //   document.body.removeChild(dummy);
  // };

  const handleListenRequest = async () => {
    db.collection("rooms").onSnapshot(async (snapshot) => {
      setListRequest(
        snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data()?.offer,
          status: item.data()?.status?.name,
          statusAt: item.data()?.status?.time,
          answerBy: item.data()?.answer?.name,
        }))
      );
    });
  };

  useEffect(() => {
    handleListenRequest();
  }, []);

  const detectTagColor = (text) => {
    switch (text) {
      case "new":
        return "gold";
      case "connecting":
        return "blue";
      case "disconnected":
        return "volcano";
      default:
        return "cyan";
    }
  };

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      // render: (text) => <a>{text}</a>,
    },
    {
      title: "Time",
      dataIndex: "time",
      key: "time",
      render: (_, record) => (
        <p style={{ margin: 0 }}>
          {moment(record?.time).format("HH:mm:ss DD/MM/YYYY")}
        </p>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (text) => <Tag color={detectTagColor(text)}>{text}</Tag>,
    },
    {
      title: "Action",
      key: "action",
      render: (_, record) => (
        <div>
          {record.status === "new" && (
            <div style={{ display: "flex", gap: 10 }}>
              <Link
                target={"_blank"}
                style={{
                  backgroundColor: "#1890ff",
                  color: "white",
                  padding: "4px 8px",
                  alignSelf: "center",
                  height: 32,
                }}
                to={`/join/${record?.id}`}
              >
                Pick up
              </Link>
              <Button
                type="danger"
                onClick={() =>
                  document.getElementById("decline-temp-button")?.click()
                }
              >
                Decline
              </Button>
            </div>
          )}
          {record.status === "connecting" && (
            <p style={{ margin: 0 }}>This call is waiting for response</p>
          )}
          {record.status === "connected" && (
            <p style={{ margin: 0 }}>
              This call is being supported at
              <b> {moment(record?.statusAt).format("HH:mm:ss DD/MM/YYYY")} </b>
              by <b>{record?.answerBy}</b>
            </p>
          )}
          {record.status === "disconnected" && (
            <p style={{ margin: 0 }}>
              This call has been hung up at
              <b> {moment(record?.statusAt).format("HH:mm:ss DD/MM/YYYY")} </b>
              by <b>{record?.answerBy}</b>
            </p>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <p style={{ fontSize: 24 }}>Call center</p>
      <Table columns={columns} dataSource={listRequest} />
    </div>
  );
};

export default RequestList;
