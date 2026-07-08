import { useState, useEffect } from "react";
import { UserCheck, UserX, Shield, Trash2, Clock, Activity } from "lucide-react";
import db from "../services/db";

export default function UserApprovals({ user }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = db.subscribeAllAccessRequests((updatedRequests) => {
      setRequests(updatedRequests);
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleApprove = async (uid) => {
    try {
      await db.updateAccessRequest(uid, { status: "approved" });
    } catch (err) {
      alert("Failed to approve user: " + err.message);
    }
  };

  const handleReject = async (uid) => {
    try {
      await db.updateAccessRequest(uid, { status: "rejected" });
    } catch (err) {
      alert("Failed to reject user: " + err.message);
    }
  };

  const handleToggleAdmin = async (uid, currentIsAdmin) => {
    try {
      await db.updateAccessRequest(uid, { isAdmin: !currentIsAdmin });
    } catch (err) {
      alert("Failed to update role: " + err.message);
    }
  };

  const handleDelete = async (uid, email) => {
    if (window.confirm(`Are you sure you want to delete access profile for ${email}?`)) {
      try {
        await db.deleteAccessRequest(uid);
      } catch (err) {
        alert("Failed to delete user request: " + err.message);
      }
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Page Header */}
      <div>
        <h2 className="page-title" style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
          <Shield size={24} /> User Access Approvals
        </h2>
        <p className="page-subtitle">Approve or reject coordinator access requests and configure administrator permissions.</p>
      </div>

      {loading ? (
        <div className="glass-panel" style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
          <span>Loading access requests...</span>
        </div>
      ) : requests.length === 0 ? (
        <div className="empty-state">
          <Clock size={48} style={{ color: "var(--text-secondary)", opacity: 0.5, marginBottom: "12px" }} />
          <p>No access requests found.</p>
        </div>
      ) : (
        <div className="glass-panel">
          <div className="table-container">
            <table className="app-table">
              <thead>
                <tr>
                  <th>User Profile</th>
                  <th style={{ textAlign: "center" }}>Role</th>
                  <th style={{ textAlign: "center" }}>Date Requested</th>
                  <th style={{ textAlign: "center" }}>Status</th>
                  <th style={{ width: "240px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => {
                  const isSelf = req.uid === user.uid;
                  const isApproved = req.status === "approved";
                  const isRejected = req.status === "rejected";
                  const isPending = req.status === "pending";

                  let requestedDate = "Unknown";
                  if (req.requestedAt && req.requestedAt.seconds) {
                    requestedDate = new Date(req.requestedAt.seconds * 1000).toLocaleString();
                  }

                  return (
                    <tr key={req.uid} style={{ opacity: isSelf ? 0.8 : 1 }}>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontWeight: "600", fontSize: "14px" }}>
                            {req.displayName || "Unknown User"} {isSelf && <span style={{ fontSize: "11px", color: "var(--accent-color)" }}>(You)</span>}
                          </span>
                          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                            {req.email}
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span 
                          style={{
                            fontSize: "11px",
                            fontWeight: "700",
                            padding: "3px 8px",
                            borderRadius: "12px",
                            textTransform: "uppercase",
                            background: req.isAdmin ? "rgba(99, 102, 241, 0.12)" : "rgba(100, 116, 139, 0.12)",
                            color: req.isAdmin ? "var(--accent-color)" : "var(--text-secondary)",
                            border: req.isAdmin ? "1px solid rgba(99, 102, 241, 0.3)" : "1px solid rgba(100, 116, 139, 0.3)"
                          }}
                        >
                          {req.isAdmin ? "Admin" : "Coordinator"}
                        </span>
                      </td>
                      <td style={{ textAlign: "center", fontSize: "13px", color: "var(--text-secondary)" }}>
                        {requestedDate}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span 
                          className="status-badge"
                          style={{
                            fontSize: "11px",
                            fontWeight: "700",
                            padding: "3px 8px",
                            borderRadius: "12px",
                            textTransform: "uppercase",
                            background: isApproved 
                              ? "rgba(16, 185, 129, 0.12)" 
                              : isRejected 
                                ? "rgba(239, 68, 68, 0.12)" 
                                : "rgba(234, 179, 8, 0.12)",
                            color: isApproved 
                              ? "var(--success-color)" 
                              : isRejected 
                                ? "var(--danger-color)" 
                                : "var(--gold-color)",
                            border: isApproved 
                              ? "1px solid rgba(16, 185, 129, 0.3)" 
                              : isRejected 
                                ? "1px solid rgba(239, 68, 68, 0.3)" 
                                : "1px solid rgba(234, 179, 8, 0.3)"
                          }}
                        >
                          {req.status}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                          {/* Approve Action */}
                          {!isApproved && (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: "4px 8px", fontSize: "12px", gap: "4px", color: "var(--success-color)", borderColor: "rgba(16, 185, 129, 0.3)" }}
                              onClick={() => handleApprove(req.uid)}
                            >
                              <UserCheck size={14} /> Approve
                            </button>
                          )}

                          {/* Reject Action */}
                          {!isRejected && !isSelf && (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: "4px 8px", fontSize: "12px", gap: "4px", color: "var(--danger-color)", borderColor: "rgba(239, 68, 68, 0.3)" }}
                              onClick={() => handleReject(req.uid)}
                            >
                              <UserX size={14} /> Reject
                            </button>
                          )}

                          {/* Toggle Admin Action */}
                          {isApproved && !isSelf && (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: "4px 8px", fontSize: "12px", gap: "4px" }}
                              onClick={() => handleToggleAdmin(req.uid, req.isAdmin)}
                            >
                              <Shield size={14} /> {req.isAdmin ? "Make Coord" : "Make Admin"}
                            </button>
                          )}

                          {/* Delete Action */}
                          {!isSelf && (
                            <button
                              type="button"
                              className="btn btn-secondary danger"
                              style={{ padding: "6px", display: "flex", alignItems: "center" }}
                              onClick={() => handleDelete(req.uid, req.email)}
                              title="Delete Profile"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
