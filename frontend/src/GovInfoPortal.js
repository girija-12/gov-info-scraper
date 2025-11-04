import React, { useState, useEffect, useRef } from 'react'
import './App.css'
import axios from 'axios'

const API_BASE = 'http://localhost:5000'

export default function GovInfoPortal() {
  const [sites, setSites] = useState([])
  const [selected, setSelected] = useState(0)
  const [updates, setUpdates] = useState({})
  const [selectedNotices, setSelectedNotices] = useState([])
  const [addOpen, setAddOpen] = useState(false)
  const [formData, setFormData] = useState({
    org_name: '',
    base_url: '',
    section_name: '',
    section_url: ''
  })
  const [darkMode, setDarkMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // --- NEW STATES for backend keyword search ---
  const [backendSearchQuery, setBackendSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [addToDefaults, setAddToDefaults] = useState(false)

  const isFormValid = formData.org_name.trim() !== '' && formData.base_url.trim() !== '' &&
    formData.section_name.trim() !== '' && formData.section_url.trim() !== ''
  const [loading, setLoading] = useState(false)

  const [emailOpen, setEmailOpen] = useState(false)
  const [emailSender, setEmailSender] = useState('')
  const [emailRecipient, setEmailRecipient] = useState('')
  const [emailBody, setEmailBody] = useState('')

  const popupRef = useRef(null)

  const handleMouseDown = (e) => {
    const popup = popupRef.current
    if (!popup) return

    const startX = e.clientX
    const startY = e.clientY
    const rect = popup.getBoundingClientRect()
    const offsetX = startX - rect.left
    const offsetY = startY - rect.top

    const onMouseMove = (e) => {
      popup.style.left = `${e.clientX - offsetX}px`
      popup.style.top = `${e.clientY - offsetY}px`
    }

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
  }

  useEffect(() => {
    axios.get(`${API_BASE}/api/organizations`)
      .then(res => {
        const portals = res.data.map(org => ({
          key: org.name.toLowerCase(),
          name: org.name
        }))
        setSites(portals)
        if (portals.length > 0) fetchNotices(portals[0].key)
      })
      .catch(err => console.error('Error fetching organizations:', err))
  }, [])

  const fetchNotices = async (key) => {
    try {
      const res = await axios.get(`${API_BASE}/api/${key}`)
      setUpdates(prev => ({ ...prev, [key]: res.data }))
    } catch (err) {
      console.error(`Error fetching notices for ${key}:`, err)
      setUpdates(prev => ({ ...prev, [key]: [] }))
    }
  }

  const currentKey = sites[selected]?.key
  const currentUpdates = updates[currentKey] || []

  const toggleNotice = (orgKey, notice) => {
    if (!notice || !notice.id) {
      console.warn('Invalid notice:', notice)
      return
    }

    const noticeId = `${orgKey}_${notice.id}`
    setSelectedNotices(prev => {
      const exists = prev.find(n => n.id === noticeId)
      if (exists) {
        return prev.filter(n => n.id !== noticeId)
      } else {
        const orgName = sites.find(s => s.key === orgKey)?.name || 'Unknown Org'
        return [...prev, { ...notice, org: orgName, id: noticeId, orgKey }]
      }
    })
  }

  const handleSend = async () => {
    if (selectedNotices.length === 0) {
      alert("No notices selected to send.")
      return
    }
    if (!emailSender.trim()) {
      alert("Please enter your sender email.")
      return
    }
    if (!emailRecipient.trim()) {
      alert("Please enter recipient email.")
      return
    }
    try {
      await axios.post(`${API_BASE}/api/send-email`, {
        portal: "Multi-Org Notices",
        sender: emailSender,
        recipient: emailRecipient
          .split(',')
          .map(e => e.trim())
          .filter(Boolean),
        message: emailBody,
        data: selectedNotices.map(n => ({
          org: n.org,
          section: n.section || n.section_name || "N/A",
          title: n.title,
          url: n.url || n.link || "#"
        }))
      })
      alert('Email sent successfully!')
      setSelectedNotices([])
      setEmailSender('')
      setEmailRecipient('')
      setEmailBody('')
      setEmailOpen(false)
    } catch (err) {
      console.error('Error sending email:', err)
      alert('Failed to send email.')
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await axios.post(`${API_BASE}/add-section`, formData)
      alert('Section added successfully!')
      setFormData({ org_name: '', base_url: '', section_name: '', section_url: '' })
      setAddOpen(false)

      // Refresh organizations and notices
      const orgRes = await axios.get(`${API_BASE}/api/organizations`)
      const portals = orgRes.data.map(org => ({
        key: org.name.toLowerCase(),
        name: org.name
      }))
      setSites(portals)

      // Optionally select the newly added org (if you want)
      const newOrgIndex = portals.findIndex(p => p.name.toLowerCase() === formData.org_name.toLowerCase())
      if (newOrgIndex >= 0) {
        setSelected(newOrgIndex)
        fetchNotices(portals[newOrgIndex].key)
      }
    } catch (err) {
      console.error('Error adding section:', err)
      alert('Error adding section.')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectAll = () => {
    const allNotices = currentUpdates.map(notice => {
      const orgName = sites[selected]?.name || 'Unknown Org'
      return {
        ...notice,
        org: orgName,
        id: `${currentKey}_${notice.id}`,
        orgKey: currentKey
      }
    })
    setSelectedNotices(prev => {
      const existingIds = new Set(prev.map(n => n.id))
      const newNotices = allNotices.filter(n => !existingIds.has(n.id))
      return [...prev, ...newNotices]
    })
  }

  const isNoticeSelected = (notice) => {
    const noticeId = `${currentKey}_${notice.id}`
    return selectedNotices.some(n => n.id === noticeId)
  }

  // --- NEW FUNCTION for backend keyword search ---
  const keywordSearch = async () => {
    if (!backendSearchQuery.trim()) return alert("Enter a keyword first.")

    const orgName = sites[selected]?.name
    if (!orgName) return alert("Select an organization first.")

    setSearchLoading(true)

    try {
      const res = await axios.post(`${API_BASE}/api/keyword-search`, {
        keyword: backendSearchQuery,
        org_name: orgName,
        add_to_defaults: addToDefaults
      })
      const { source, results } = res.data
      console.log(`[Search via backend: ${source}]`, results)
      setUpdates(prev => ({ ...prev, [orgName.toLowerCase()]: results }))
    } catch (err) {
      console.error("Backend keyword search failed:", err)
      alert("Search failed. See console for details.")
    } finally {
      setSearchLoading(false)
    }
  }

  const filteredNotices = currentUpdates.filter(item => {
    const keywords = searchQuery
      .toLowerCase()
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0); // remove empty keywords

    if (keywords.length === 0) return true; // no keywords => show all

    return keywords.some(k =>
      (item.title?.toLowerCase().includes(k) || item.section?.toLowerCase().includes(k))
    );
  });

  return (
    <div className={`gov-dashboard ${darkMode ? 'dark' : 'light'}`}>
      <header>
        <h1>GrantNexusRIT - Smart Research Funding Discovery Engine</h1>
        <button onClick={() => setDarkMode(!darkMode)}>
          {darkMode ? '☀' : '🌙'}
        </button>
      </header>

      <div className="main-container">
        <aside>
          {sites.map((s, i) => (
            <button
              key={s.key}
              className={i === selected ? 'active' : ''}
              onClick={() => {
                setSelected(i)
                fetchNotices(s.key)
              }}
            >
              {s.name}
            </button>
          ))}
        </aside>

        <main>
          {/* UPDATED toolbar with backend keyword search */}
          <div className="toolbar">
            <input
              type="text"
              placeholder="Search notices..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="search-bar"
            />

            <input
              type="text"
              placeholder="Scrap New keywords..."
              value={backendSearchQuery}
              onChange={e => setBackendSearchQuery(e.target.value)}
              className="search-bar"
            />
            <label>
              <input
                type="checkbox"
                checked={addToDefaults}
                onChange={e => setAddToDefaults(e.target.checked)}
              />
              Add to default keywords
            </label>
            <button onClick={keywordSearch} disabled={searchLoading}>
              {searchLoading ? 'Searching...' : 'Search'}
            </button>

            <button onClick={handleSelectAll}>Select All</button>
            <button onClick={() => setEmailOpen(prev => !prev)}>Compose Email</button>
            <button onClick={() => setSelectedNotices([])}>Clear</button>
          </div>
          {emailOpen && (
            <div
              className="email-compose-box"
              ref={popupRef}
              onMouseDown={handleMouseDown}
            >
              <div className="email-compose-header">
                Compose Email
                <button className="email-close-btn" onClick={() => setEmailOpen(false)}>✖</button>
              </div>

              <div className="email-compose-body">
                <input
                  type="email"
                  placeholder="Your Email (Sender)"
                  value={emailSender}
                  onChange={e => setEmailSender(e.target.value)}
                />
                <input
                  type="email"
                  placeholder="Recipient Emails (comma-separated)"
                  value={emailRecipient}
                  onChange={e => setEmailRecipient(e.target.value)}
                />
                <textarea
                  placeholder="Email Message"
                  value={emailBody}
                  onChange={e => setEmailBody(e.target.value)}
                  rows={4}
                />

                <div className="selected-notices-preview">
                  {selectedNotices.map((n, i) => (
                    <div key={i} className="preview-notice">
                      <strong>{n.org}</strong>
                      <div>{n.title} — <a href={n.url || "#"} target="_blank" rel="noreferrer">link</a></div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                className="send-email-btn small-btn"
                onClick={handleSend}
                disabled={!selectedNotices.length}
              >
                📧 Send
              </button>
            </div>
          )}
          <div className="notices">
            {filteredNotices.length === 0 ? (
              <p className="no-updates-message">No updates found.</p>
            ) : (
              filteredNotices.map((item, i) => (
                <div
                  key={i}
                  className={`notice-card ${isNoticeSelected(item) ? 'selected' : ''}`}
                  onClick={() => toggleNotice(currentKey, item)}
                >
                  <input
                    type="checkbox"
                    checked={isNoticeSelected(item)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleNotice(currentKey, item)}
                  />
                  <div className="notice-content">
                    <strong>{item.title}</strong>
                    <p>{item.section}</p>
                    <a href={item.url} target="_blank" rel="noreferrer">View</a>
                  </div>
                </div>
              ))
            )}
          </div>

        </main>
      </div>

      <button className="fab" onClick={() => setAddOpen(true)}>➕</button>

      {addOpen && (
        <div className="modal">
          <form onSubmit={handleAdd}>
            <h2>Add New Section</h2>
            <input
              placeholder="Org Name"
              value={formData.org_name}
              onChange={e => setFormData({ ...formData, org_name: e.target.value })}
            />
            <input
              placeholder="Base URL"
              value={formData.base_url}
              onChange={e => setFormData({ ...formData, base_url: e.target.value })}
            />
            <input
              placeholder="Section Name"
              value={formData.section_name}
              onChange={e => setFormData({ ...formData, section_name: e.target.value })}
            />
            <input
              placeholder="Section Path"
              value={formData.section_url}
              onChange={e => setFormData({ ...formData, section_url: e.target.value })}
            />
            <button type="submit" disabled={!isFormValid || loading}>{loading ? 'Adding...' : 'Add'}</button>
            <button type="button" onClick={() => setAddOpen(false)}>Cancel</button>
          </form>
        </div>
      )}
    </div>
  )
}