import { useState, useRef, useEffect } from "react"
import axios from "axios"
import ReactMarkdown from "react-markdown"
import { MediaRecorder, register } from "extendable-media-recorder"
import { connect } from "extendable-media-recorder-wav-encoder"
import "./App.css"
import Projects from "./Projects"

const API = "http://localhost:8000"

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── Shared chat read-only view ──
function SharedView() {
  let sharedMessages = []
  let error = false
  const sharedParam = new URLSearchParams(window.location.search).get("shared")
  try {
    sharedMessages = JSON.parse(decodeURIComponent(atob(sharedParam)))
  } catch {
    error = true
  }
  if (error) return (
    <div style={{ color: "white", padding: "32px", background: "#0f1017", minHeight: "100vh" }}>
      Invalid or corrupted share link.
    </div>
  )
  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "32px 24px", fontFamily: "sans-serif", background: "#0f1017", minHeight: "100vh", color: "#d1d2d3" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px", borderBottom: "1px solid #1e2029", paddingBottom: "16px" }}>
        <div style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", borderRadius: "8px", padding: "8px 14px", fontWeight: "700", fontSize: "18px", color: "white" }}>K</div>
        <div>
          <div style={{ fontWeight: "700", fontSize: "18px" }}>KnowBot</div>
          <div style={{ fontSize: "12px", color: "#4b5563" }}>Shared conversation — read only</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: "11px", color: "#4b5563", background: "#1e2029", padding: "4px 10px", borderRadius: "20px" }}>
          🔒 Read only
        </div>
      </div>
      {sharedMessages.map((msg, i) => (
        <div key={i} style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
          <div style={{
            width: "32px", height: "32px", borderRadius: "6px", flexShrink: 0,
            background: msg.role === "user" ? "#374151" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: "700", fontSize: "13px", color: "white"
          }}>
            {msg.role === "user" ? "U" : "K"}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "13px", fontWeight: "600", marginBottom: "4px" }}>
              <span style={{ color: msg.role === "user" ? "#d1d2d3" : "#818cf8" }}>
                {msg.role === "user" ? "You" : "KnowBot"}
              </span>
              <span style={{ fontWeight: "400", color: "#4b5563", fontSize: "11px", marginLeft: "8px" }}>{msg.time}</span>
            </div>
            <div style={{ fontSize: "14px", lineHeight: "1.6", color: "#d1d2d3" }}>
              <ReactMarkdown>{msg.text}</ReactMarkdown>
            </div>
            {msg.sources?.length > 0 && (
              <div style={{ fontSize: "11px", color: "#4b5563", marginTop: "6px" }}>{msg.sources.join(" · ")}</div>
            )}
          </div>
        </div>
      ))}
      <div style={{ textAlign: "center", fontSize: "12px", color: "#2c2d30", marginTop: "40px" }}>
        Powered by KnowBot · AI Knowledge Assistant
      </div>
    </div>
  )
}

export default function App() {
  // Check if this is a shared view
  const sharedParam = new URLSearchParams(window.location.search).get("shared")
  if (sharedParam) return <SharedView />

  // ── Chat state ──
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState("chat")
  const [selectedProject, setSelectedProject] = useState(null)
  const [projects, setProjects] = useState([])
  const [shareCopied, setShareCopied] = useState(false)

  // ── File upload state ──
  const [audioFile, setAudioFile] = useState(null)
  const [audioName, setAudioName] = useState("")
  const [transcribing, setTranscribing] = useState(false)

  // ── Live meeting state ──
  const [isRecording, setIsRecording] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState("")
  const [meetingNotes, setMeetingNotes] = useState(null)
  const [meetingLang, setMeetingLang] = useState("en-IN")
  const [meetingType, setMeetingType] = useState("internal")
  const [recordingTime, setRecordingTime] = useState(0)
  const [encoderReady, setEncoderReady] = useState(false)

  // ── Refs ──
  const bottomRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const sessionIdRef = useRef(null)
  const timerRef = useRef(null)

  const chatSessionIdRef = useRef(
    sessionStorage.getItem("knowbot_session_id") ||
    (() => {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2)
      sessionStorage.setItem("knowbot_session_id", id)
      return id
    })()
  )

  useEffect(() => {
    const setup = async () => {
      try {
        await register(await connect())
        setEncoderReady(true)
      } catch (err) {
        console.error("WAV encoder registration failed:", err)
      }
    }
    setup()
  }, [])

  useEffect(() => {
    axios.get(`${API}/projects`)
      .then(res => setProjects(res.data.projects || []))
      .catch(() => {})
  }, [tab])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // ── Chat ──
  const sendMessage = async (text) => {
    const question = text || input.trim()
    if (!question) return
    setInput("")
    setMessages(prev => [...prev, { role: "user", text: question, time: formatTime() }])
    setLoading(true)
    try {
      const res = await axios.post(`${API}/ask`, {
        question,
        session_id: chatSessionIdRef.current,
        ...(selectedProject?.id && { project_id: selectedProject.id })
      })
      setMessages(prev => [...prev, {
        role: "bot",
        text: res.data.answer,
        sources: res.data.sources,
        time: formatTime()
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: "bot",
        text: "Something went wrong. Please try again.",
        sources: [],
        time: formatTime()
      }])
    }
    setLoading(false)
  }

  // ── Clear chat ──
  const clearChat = async () => {
    try {
      await axios.delete(`${API}/chat/session/${chatSessionIdRef.current}`)
    } catch {}
    const newId = Date.now().toString(36) + Math.random().toString(36).slice(2)
    sessionStorage.setItem("knowbot_session_id", newId)
    chatSessionIdRef.current = newId
    setMessages([])
  }

  // ── Share chat via URL ──
  const shareChat = () => {
    if (messages.length === 0) {
      alert("No messages to share yet!")
      return
    }
    try {
      const encoded = btoa(encodeURIComponent(JSON.stringify(messages)))
      const url = `${window.location.origin}?shared=${encoded}`
      navigator.clipboard.writeText(url).then(() => {
        setShareCopied(true)
        setTimeout(() => setShareCopied(false), 3000)
      })
    } catch {
      alert("Failed to generate share link. Chat may be too long.")
    }
  }

  // ── Audio file handler ──
  const handleAudioChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setAudioFile(file)
      setAudioName(file.name)
      setMeetingNotes(null)
      setLiveTranscript("")
    }
  }

  // ── Upload existing file → Sarvam ──
  const handleTranscribeFile = async () => {
    if (!audioFile) return
    setTranscribing(true)
    const formData = new FormData()
    formData.append("file", audioFile)
    try {
      const res = await axios.post(
        `${API}/meeting/transcribe-file?language=${meetingLang}&meeting_type=${meetingType}`,
        formData
      )
      setMeetingNotes(res.data)
      setLiveTranscript(res.data.full_transcript || "")
    } catch {
      setMeetingNotes({ error: "Failed to process file. Please try again." })
    }
    setTranscribing(false)
  }

  // ── Live recording → WAV → Sarvam ──
  const startRecording = async () => {
    if (!encoderReady) {
      alert("Audio encoder still loading. Please wait a moment and try again.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      sessionIdRef.current = Date.now().toString()
      setLiveTranscript("")
      setMeetingNotes(null)
      setIsRecording(true)
      setRecordingTime(0)

      timerRef.current = setInterval(() => {
        setRecordingTime(t => t + 1)
      }, 1000)

      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/wav" })
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = async (e) => {
        if (e.data.size === 0) return
        const formData = new FormData()
        formData.append("file", e.data, "chunk.wav")
        try {
          const res = await axios.post(
            `${API}/meeting/transcribe-chunk?session_id=${sessionIdRef.current}&language=${meetingLang}`,
            formData
          )
          setLiveTranscript(res.data.full_transcript || "")
        } catch (err) {
          console.error("[CHUNK] Failed:", err.response?.data || err.message)
        }
      }

      mediaRecorder.start(3000)

    } catch (err) {
      console.error("Recording error:", err)
      alert("Microphone access denied. Please allow mic access and try again.")
      setIsRecording(false)
      clearInterval(timerRef.current)
    }
  }

  const stopRecording = async () => {
    mediaRecorderRef.current?.stop()
    clearInterval(timerRef.current)
    setIsRecording(false)
    try {
      const res = await axios.post(`${API}/meeting/end`, {
        session_id: sessionIdRef.current,
        meeting_type: meetingType
      })
      setMeetingNotes(res.data)
    } catch (err) {
      setMeetingNotes({ error: "Failed to generate notes. Please try again." })
    }
  }

  // ── Download summary as PDF or DOCX ──
  const downloadSummary = async (format) => {
    if (!meetingNotes) {
      alert("No meeting summary available. Please record or upload a meeting first.")
      return
    }
    try {
      const response = await axios.post(
        `${API}/meeting/download/${format}`,
        {
          summary: meetingNotes.summary || "",
          key_decisions: meetingNotes.key_decisions || "",
          action_items: meetingNotes.action_items || "",
          transcript: meetingNotes.full_transcript || liveTranscript || ""
        },
        { responseType: "blob" }
      )
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement("a")
      link.href = url
      link.setAttribute("download", `meeting-summary.${format}`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Download failed:", err)
      alert("Download failed. Make sure a meeting has been summarized first.")
    }
  }

  const suggestions = [
    "What is the leave policy?",
    "How do I onboard a new developer?",
    "What is the escalation process?"
  ]

  return (
    <div className="app">

      {/* ── Sidebar ── */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">KnowBot</div>
          <div className="sidebar-subtitle">AI Knowledge Assistant</div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Channels</div>
          <div
            className={`sidebar-item ${tab === "chat" ? "active" : ""}`}
            onClick={() => setTab("chat")}
          >
            document-qa
          </div>
          <div
            className={`sidebar-item ${tab === "meeting" ? "active" : ""}`}
            onClick={() => setTab("meeting")}
          >
            meeting-summarizer
          </div>
          <div
            className={`sidebar-item ${tab === "projects" ? "active" : ""}`}
            onClick={() => setTab("projects")}
          >
            projects
          </div>
        </div>

        <div className="sidebar-divider" />
        <div className="sidebar-footer">SDG 8 — Decent Work & Growth</div>
      </div>

      {/* ── Main content ── */}
      <div className="main">

        {/* ════ TAB 1: Document Q&A ════ */}
        {tab === "chat" && (
          <>
            <div className="chat-header">
              <span className="channel-hash">#</span>
              <span className="channel-name">document-qa</span>
              <div className="channel-divider" />
              <span className="channel-desc">Ask anything about company policies and processes</span>

              {/* Header buttons */}
              <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  onClick={shareChat}
                  style={{
                    background: shareCopied ? "#166534" : "none",
                    border: `1px solid ${shareCopied ? "#16a34a" : "#2c2d30"}`,
                    color: shareCopied ? "#4ade80" : "#818cf8",
                    borderRadius: "6px", padding: "4px 12px",
                    fontSize: "12px", cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                >
                  {shareCopied ? "✓ Link copied!" : "🔗 Share Chat"}
                </button>
                <button
                  onClick={clearChat}
                  style={{
                    background: "none",
                    border: "1px solid #2c2d30", color: "#4b5563",
                    borderRadius: "6px", padding: "4px 12px",
                    fontSize: "12px", cursor: "pointer"
                  }}
                >
                  Clear chat
                </button>
              </div>
            </div>

            <div className="messages">
              {messages.length === 0 && (
                <>
                  <div className="welcome">
                    <div className="welcome-icon">K</div>
                    <div className="welcome-title">Welcome to KnowBot</div>
                    <div className="welcome-subtitle">
                      Your AI-powered company knowledge assistant. Ask anything about HR policies, onboarding, escalation processes, and more.
                    </div>
                  </div>
                  <div className="suggestions">
                    <div className="suggestions-label">Try asking</div>
                    <div className="suggestions-row">
                      {suggestions.map((s, i) => (
                        <button key={i} className="suggestion-btn" onClick={() => sendMessage(s)}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`message ${msg.role}`}>
                  <div className="message-avatar">{msg.role === "user" ? "U" : "K"}</div>
                  <div className="message-body">
                    <div className="message-meta">
                      <span className="message-name">{msg.role === "user" ? "You" : "KnowBot"}</span>
                      <span className="message-time">{msg.time}</span>
                    </div>
                    <div className="message-text">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                    {msg.sources?.length > 0 && (
                      <div className="message-sources">{msg.sources.join(" · ")}</div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="message bot">
                  <div className="message-avatar">K</div>
                  <div className="message-body">
                    <div className="message-meta"><span className="message-name">KnowBot</span></div>
                    <div className="typing"><span /><span /><span /></div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Project scope selector */}
            <div style={{ padding: "8px 24px 0", display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "12px", color: "#4b5563" }}>Searching:</span>
              <select
                value={selectedProject?.id || "all"}
                onChange={e => {
                  const proj = projects.find(p => p.id === e.target.value)
                  setSelectedProject(proj || null)
                }}
                style={{ background: "#161720", border: "1px solid #1e2029", color: "#d1d2d3", padding: "4px 10px", borderRadius: "6px", fontSize: "12px" }}
              >
                <option value="all">All Projects</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {selectedProject && (
                <span style={{ fontSize: "11px", color: "#818cf8" }}>
                  Searching only in "{selectedProject.name}"
                </span>
              )}
            </div>

            <div className="input-bar">
              <div className="input-wrapper">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  placeholder="Ask about company policies, processes, or projects..."
                  disabled={loading}
                />
                <button onClick={() => sendMessage()} disabled={loading}>
                  {loading ? "..." : "Send"}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ════ TAB 2: Meeting Summarizer ════ */}
        {tab === "meeting" && (
          <div className="transcribe-panel">
            <div className="chat-header">
              <span className="channel-hash">#</span>
              <span className="channel-name">meeting-summarizer</span>
              <div className="channel-divider" />
              <span className="channel-desc">
                Live transcription powered by Sarvam AI
                {!encoderReady && (
                  <span style={{ color: "#EF9F27", marginLeft: "8px", fontSize: "11px" }}>(encoder loading...)</span>
                )}
              </span>
            </div>

            <div className="transcribe-body">
              <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                <select
                  value={meetingLang}
                  onChange={e => setMeetingLang(e.target.value)}
                  style={{ background: "#161720", border: "1px solid #1e2029", color: "#d1d2d3", padding: "8px 12px", borderRadius: "8px", fontSize: "13px" }}
                >
                  <option value="en-IN">English (Indian)</option>
                  <option value="hi-IN">Hindi</option>
                  <option value="gu-IN">Gujarati</option>
                  <option value="mr-IN">Marathi</option>
                </select>

                <select
                  value={meetingType}
                  onChange={e => setMeetingType(e.target.value)}
                  style={{ background: "#161720", border: "1px solid #1e2029", color: "#d1d2d3", padding: "8px 12px", borderRadius: "8px", fontSize: "13px" }}
                >
                  <option value="internal">Internal Meeting</option>
                  <option value="remote">Remote Meeting</option>
                  <option value="client">Client Call</option>
                </select>

                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    disabled={!encoderReady}
                    style={{
                      background: encoderReady ? "linear-gradient(135deg,#e11d48,#be123c)" : "#374151",
                      color: "#fff", border: "none", borderRadius: "8px",
                      padding: "10px 24px", fontSize: "13px", fontWeight: "600",
                      cursor: encoderReady ? "pointer" : "not-allowed"
                    }}
                  >
                    {encoderReady ? "Start Recording" : "Loading..."}
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    style={{
                      background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                      color: "#fff", border: "none", borderRadius: "8px",
                      padding: "10px 24px", fontSize: "13px", fontWeight: "600",
                      cursor: "pointer", display: "flex", alignItems: "center", gap: "8px"
                    }}
                  >
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#fff" }} />
                    Stop & Generate Notes
                  </button>
                )}

                {isRecording && (
                  <span style={{ fontSize: "13px", color: "#9ca3af" }}>
                    Recording: {Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, "0")}
                  </span>
                )}
              </div>

              {(liveTranscript || isRecording) && (
                <div className="result-box">
                  <div className="result-title">Live Transcript</div>
                  <div className="result-text" style={{ minHeight: "100px" }}>
                    {liveTranscript || "Listening... (transcript appears every 5 seconds)"}
                  </div>
                </div>
              )}

              {meetingNotes && (
                <div className="result-grid">
                  <div className="result-box">
                    <div className="result-title">Full Transcript</div>
                    <div className="result-text">{meetingNotes.full_transcript || "No transcript available."}</div>
                  </div>
                  <div className="result-box">
                    <div className="result-title">Meeting Notes</div>
                    <div className="result-text">
                      <ReactMarkdown>{meetingNotes.raw || meetingNotes.error || "No notes generated."}</ReactMarkdown>
                    </div>

                    {!meetingNotes.error && (
                      <div style={{ display: "flex", gap: "10px", marginTop: "16px", flexWrap: "wrap" }}>
                        <button
                          onClick={() => downloadSummary("pdf")}
                          style={{
                            background: "linear-gradient(135deg,#4f8ef7,#3b6fd4)",
                            color: "white", border: "none", borderRadius: "8px",
                            padding: "9px 20px", cursor: "pointer",
                            fontWeight: "600", fontSize: "13px",
                            display: "flex", alignItems: "center", gap: "6px"
                          }}
                        >
                          ⬇ Download PDF
                        </button>
                        <button
                          onClick={() => downloadSummary("docx")}
                          style={{
                            background: "linear-gradient(135deg,#2ecc71,#27ae60)",
                            color: "white", border: "none", borderRadius: "8px",
                            padding: "9px 20px", cursor: "pointer",
                            fontWeight: "600", fontSize: "13px",
                            display: "flex", alignItems: "center", gap: "6px"
                          }}
                        >
                          ⬇ Download Word
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ height: "1px", background: "#1e2029", margin: "8px 0" }} />

              <div>
                <div style={{ fontSize: "12px", color: "#4b5563", marginBottom: "8px" }}>
                  Or upload an existing recording:
                </div>
                <div className="upload-zone">
                  <label className="upload-label" htmlFor="audio-upload">
                    {audioName ? `Selected: ${audioName}` : <><span>Browse</span> or drop MP3, WAV, M4A</>}
                  </label>
                  <input id="audio-upload" type="file" accept=".mp3,.wav,.m4a" onChange={handleAudioChange} />
                </div>
                {audioFile && (
                  <button className="transcribe-btn" onClick={handleTranscribeFile} disabled={transcribing} style={{ marginTop: "10px" }}>
                    {transcribing ? "Processing..." : "Transcribe & Summarize"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════ TAB 3: Projects ════ */}
        {tab === "projects" && (
          <Projects
            onBack={() => setTab("chat")}
            onSelectProject={(project) => {
              setSelectedProject(project)
              setTab("chat")
            }}
          />
        )}

      </div>
    </div>
  )
}