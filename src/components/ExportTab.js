'use client'
import { useState } from 'react'

const CANADA_HOLIDAYS = [
  { name: "Canada Day", date: "July 1", emoji: "🍁", theme: "red and white, patriotic, celebratory" },
  { name: "BC Day", date: "August 3", emoji: "🏔️", theme: "nature, BC pride, summer" },
  { name: "Labour Day", date: "September 7", emoji: "💪", theme: "end of summer, hardworking, community" },
  { name: "National Day for Truth and Reconciliation", date: "September 30", emoji: "🧡", theme: "respectful, orange shirt, reflection, no sales or promotional tone" },
  { name: "Thanksgiving", date: "October 12", emoji: "🍂", theme: "warm autumn tones, gratitude, family" },
  { name: "Halloween", date: "October 31", emoji: "🎃", theme: "dark, spooky, fun, orange and black" },
  { name: "Remembrance Day", date: "November 11", emoji: "🌹", theme: "respectful, red poppy, solemn" },
  { name: "Christmas", date: "December 25", emoji: "🎄", theme: "warm, festive, red and green, cozy" },
  { name: "New Year", date: "January 1", emoji: "🎆", theme: "gold, celebration, fresh start, sparkle" },
  { name: "Valentine's Day", date: "February 14", emoji: "💝", theme: "romantic, pink and red, love, warmth" },
  { name: "Mother's Day", date: "May 9", emoji: "🌸", theme: "soft florals, warmth, appreciation, pink" },
  { name: "Father's Day", date: "June 20", emoji: "👔", theme: "bold, warm, appreciation, earthy tones" },
]

// ── Dynamic prompt generator — reads entirely from clients.js ──────────────────
function buildSystemPrompt(client) {
  const colorDesc = client.colors.map((hex, i) => `${client.colorNames[i]} (${hex})`).join(', ')
  const avoid = client.avoid ? `\nNEVER USE: ${client.avoid}` : ''
  const location = client.address || 'Vancouver, BC'
  return `You are a social media content creator for ${client.name} (${client.nameKo}), a ${client.category} in ${location}.

BRAND COLORS: ${colorDesc}
TONE: ${client.tone.join(', ')}
KEY SERVICES: ${client.highlights.join(', ')}
DESIGN SCHEDULE: ${client.schedule}${avoid}

Always write in the brand voice. Use exact HEX color codes when referencing colors. Keep content relevant to the Vancouver/BC market.`
}

function buildQuickPrompt(client, type) {
  const base = buildSystemPrompt(client)
  const colorDesc = client.colors.map((hex, i) => `${client.colorNames[i]} (${hex})`).join(', ')
  const prompts = {
    'Instagram Post': `${base}

TASK: Write an Instagram feed post (1080x1350px, 4:5 portrait).
- Caption: engaging, on-brand, under 150 words
- Include a clear CTA
- End with 10 relevant hashtags
- Visual direction: use brand colors ${colorDesc}`,

    'Story': `${base}

TASK: Write an Instagram Story sequence (1080x1920px, 9:16).
- 3-5 story frames
- Each frame: 1 short punchy line + CTA direction
- Keep it casual and quick to consume`,

    'Carousel (5 slides)': `${base}

TASK: Write a 5-slide Instagram carousel (1080x1350px each).
- Slide 1: Hook headline (make them swipe)
- Slides 2-4: One key point each, minimal text
- Slide 5: CTA + booking prompt
- Include caption + 10 hashtags`,

    'Caption + Hashtags': `${base}

TASK: Write only the Instagram caption and hashtags.
- Caption: 80-120 words, warm and on-brand
- 15 hashtags: mix of niche, local (Vancouver/BC), and broad
- Format: caption first, then hashtags on new line`,
  }
  return prompts[type] || base
}


const FORMAT_PRESETS = {
  social: [
    {
      key: "ig_post",
      label: "Instagram Post",
      emoji: "📸",
      size: "1080 × 1350px",
      ratio: "4:5 portrait",
      spec: "1080px × 1350px (4:5 portrait), 72dpi, RGB",
      usage: "Instagram feed post",
      notes: "Most engaging feed format. Keep key content in center, avoid edges."
    },
    {
      key: "ig_square",
      label: "Instagram Square",
      emoji: "⬜",
      size: "1080 × 1080px",
      ratio: "1:1",
      spec: "1080px × 1080px (1:1 square), 72dpi, RGB",
      usage: "Instagram feed — square",
      notes: "Classic square. Good for product shots and logos."
    },
    {
      key: "ig_story",
      label: "Instagram Story",
      emoji: "📱",
      size: "1080 × 1920px",
      ratio: "9:16 vertical",
      spec: "1080px × 1920px (9:16 vertical), 72dpi, RGB",
      usage: "Instagram / Facebook Story",
      notes: "Keep main content between top 250px and bottom 250px safe zones."
    },
    {
      key: "ig_carousel",
      label: "Carousel Slide",
      emoji: "🎠",
      size: "1080 × 1350px",
      ratio: "4:5 portrait",
      spec: "1080px × 1350px per slide (4:5 portrait), 72dpi, RGB",
      usage: "Instagram carousel — multi-slide",
      notes: "Design 3–10 slides with consistent layout. First slide is the hook."
    },
  ],
  print: [
    {
      key: "business_card",
      label: "Business Card",
      emoji: "💳",
      size: "3.5 × 2 in",
      ratio: "Standard",
      spec: "3.5in × 2in (with 0.125in bleed = 3.75 × 2.25in), 300dpi, CMYK",
      usage: "Standard business card",
      notes: "Include 0.125in bleed on all sides. Keep text 0.125in from trim edge."
    },
    {
      key: "flyer_letter",
      label: "Flyer 8.5×11",
      emoji: "📄",
      size: "8.5 × 11 in",
      ratio: "Letter",
      spec: "8.5in × 11in (with 0.125in bleed), 300dpi, CMYK",
      usage: "Standard letter flyer / poster",
      notes: "Most common print size. Good for menus, promos, event flyers."
    },
    {
      key: "flyer_11x17",
      label: "Flyer 11×17",
      emoji: "🗞️",
      size: "11 × 17 in",
      ratio: "Tabloid",
      spec: "11in × 17in (with 0.125in bleed), 300dpi, CMYK",
      usage: "Large format flyer / poster",
      notes: "Double letter size. Great for window displays and event posters."
    },
    {
      key: "flyer_12x18",
      label: "Poster 12×18",
      emoji: "🖼️",
      size: "12 × 18 in",
      ratio: "2:3",
      spec: "12in × 18in (with 0.125in bleed), 300dpi, CMYK",
      usage: "Premium poster",
      notes: "Popular for restaurant menus and retail displays."
    },
    {
      key: "banner",
      label: "Banner 24×36",
      emoji: "🎌",
      size: "24 × 36 in",
      ratio: "2:3",
      spec: "24in × 36in, 150dpi minimum (viewed from distance), CMYK",
      usage: "Retractable banner / large poster",
      notes: "Lower dpi is okay since viewed from a distance. Keep text large."
    },
  ]
}

function generateClientContext(client) {
  return `# CLIENT CONTEXT — ${client.name}

## Basic Info
- **Name:** ${client.name} (${client.nameKo})
- **Industry:** ${client.category}
- **Instagram:** ${client.instagram}
- **Website:** ${client.website}${client.phone ? `\n- **Phone:** ${client.phone}` : ''}${client.address ? `\n- **Address:** ${client.address}` : ''}

## Brand Colors
${client.colors.map((c, i) => `- ${client.colorNames[i]}: ${c}`).join('\n')}

## Tone of Voice
${client.tone.join(' · ')}

## Key Services / Products
${client.highlights.map(h => `- ${h}`).join('\n')}

## Design Schedule
${client.schedule}

## AI System Prompt
${buildSystemPrompt(client)}

## Do's & Don'ts
**Do:**
- Always match brand colors: ${client.colors.slice(0,2).join(', ')}
- Keep tone: ${client.tone.slice(0,2).join(', ')}
- Highlight: ${client.highlights.slice(0,3).join(', ')}

**Don't:**
- Don't use off-brand colors
- Don't use generic stock imagery
- Don't use overly formal language unless it matches the tone

## Copywriting Rules
- Write in the voice of: ${client.tone.join(', ')}
- Target audience: Vancouver locals and surrounding area
- Call to action should feel natural, not pushy
- Keep captions concise, punchy, and on-brand

## Campaign Themes to Explore
- Seasonal promotions tied to Canadian holidays
- Behind-the-scenes / authentic storytelling
- Customer testimonials and social proof
- Educational content about services/products
- Limited time offers and exclusives
`
}

function generateHolidayCampaign(client, holiday) {
  return `# ${holiday.emoji} ${holiday.name} Campaign — ${client.name}

**Holiday:** ${holiday.name} (${holiday.date})
**Client:** ${client.name} | ${client.category}
**Brand Colors:** ${client.colors.slice(0,3).map((c,i) => `${client.colorNames[i]} ${c}`).join(', ')}
**Tone:** ${client.tone.join(', ')}

---

## Campaign Concept
Create a ${holiday.name} campaign for ${client.name} that feels authentic to the brand while embracing the holiday spirit (${holiday.theme}).

## Instagram Post Idea
A visual celebrating ${holiday.name} from the perspective of ${client.name}. Incorporate brand colors with holiday accents. Feature: ${client.highlights[0]}.

## Caption Angle
Connect ${holiday.name} to the brand's core message. Make it feel warm and relevant to Vancouver locals.

## Visual Direction
- **Color palette:** Blend ${client.colors[0]} with ${holiday.theme} accents
- **Mood:** ${client.tone[0]}, celebratory
- **Format:** Single hero image or 2-3 slide carousel
- **Typography:** Clean, minimal — let the visual speak

## Text Overlay Ideas
- "${holiday.emoji} Happy ${holiday.name} from ${client.name}!"
- "Celebrating ${holiday.name} with [service/product highlight]"

## ChatGPT Prompt
\`\`\`
You are creating a ${holiday.name} Instagram post for ${client.name}, a ${client.category} in Vancouver.

Brand colors: ${client.colors.slice(0,2).join(', ')}
Tone: ${client.tone.join(', ')}
Holiday vibe: ${holiday.theme}

Write:
1. A caption (under 150 words) that connects ${holiday.name} to ${client.highlights[0]}
2. 5 relevant hashtags
3. A story caption (shorter, punchier)
\`\`\`

## Claude Design Prompt
\`\`\`
Design a ${holiday.name} Instagram post for ${client.name}.
Style: ${client.tone[0]}, ${client.tone[1] || 'modern'}
Colors: Primary ${client.colors[0]}, accent with ${holiday.theme}
Include: Brand name, holiday greeting, minimal text overlay
Format: 1080x1350px (4:5 portrait)
\`\`\`
`
}

function generateBulkHolidayCampaigns(allClients, holiday) {
  return allClients.map(client =>
    generateHolidayCampaign(client, holiday)
  ).join('\n\n---\n\n')
}


function generateDesignPrompt(client, format, holiday = null) {
  const isHoliday = holiday !== null
  const holidayContext = isHoliday
    ? `\n\nHOLIDAY: ${holiday.name} (${holiday.date})\nHoliday mood: ${holiday.theme}`
    : ''

  return `# Design Prompt — ${client.name}
## Format: ${format.label} (${format.size})

**Client:** ${client.name} | ${client.category}
**Format:** ${format.label}
**Spec:** ${format.spec}
**Usage:** ${format.usage}
**Note:** ${format.notes}

---

## Claude Design / Canva Prompt

Design a ${format.label} for **${client.name}**, a ${client.category} based in Vancouver.${holidayContext}

**Size:** ${format.spec}
**Brand Colors:** ${client.colors.map((c,i) => `${client.colorNames[i]} (${c})`).join(', ')}
**Tone:** ${client.tone.join(', ')}
**Style:** ${client.tone[0]}, modern, editorial

**Content to include:**
- Brand name: ${client.name}
${isHoliday ? `- Holiday: ${holiday.emoji} ${holiday.name} greeting` : `- Key service highlight: ${client.highlights[0]}`}
- Minimal text overlay
- Brand color palette as primary palette

**Visual direction:**
- Primary color: ${client.colors[0]}
- Accent: ${client.colors[1] || client.colors[0]}
- Clean typography, ${client.tone[0].toLowerCase()} feel
- Real photography or minimal illustration (no generic stock)
${isHoliday ? `- Holiday accent colors blended with brand palette` : ''}

**Do NOT:**
- Use off-brand colors
- Add too much text
- Use generic clipart or busy backgrounds

---

## Midjourney / AI Image Prompt

"${client.tone[0].toLowerCase()} ${client.category.toLowerCase()} ${isHoliday ? holiday.name + ' ' : ''}promotional design, ${client.colors[0]} and ${client.colors[1] || '#ffffff'} color palette, ${format.ratio} format, minimal typography, Vancouver aesthetic, editorial photography style, professional marketing design --ar ${format.ratio.includes('4:5') ? '4:5' : format.ratio.includes('9:16') ? '9:16' : format.ratio.includes('1:1') ? '1:1' : '11:17'}"
`
}

export default function ExportTab({ client, allClients }) {
  const [copied, setCopied] = useState('')
  const [selectedHoliday, setSelectedHoliday] = useState(null)
  const [bulkHoliday, setBulkHoliday] = useState(null)
  const [bulkGenerated, setBulkGenerated] = useState('')
  const [activeSection, setActiveSection] = useState('context') // context | holiday | bulk | design
  const [selectedFormat, setSelectedFormat] = useState(null)
  const [designHoliday, setDesignHoliday] = useState(null)

  const copy = (text, key) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(''), 2000)
  }

  const downloadMd = (content, filename) => {
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const s = { background: "#FFF", borderRadius: 12, padding: 22, marginBottom: 16 }
  const labelStyle = { fontSize: 10, color: "#999", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }
  const btnPrimary = { padding: "9px 18px", background: "#1a1a1a", color: "#fff", borderRadius: 8, fontSize: 12, border: "none", cursor: "pointer" }
  const btnSecondary = { padding: "9px 18px", background: "#F0EDE8", color: "#555", borderRadius: 8, fontSize: 12, border: "none", cursor: "pointer" }

  return (
    <div>
      {/* Section tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { key: 'context', label: '📋 Client Context' },
          { key: 'design', label: '🎨 Design Prompt' },
          { key: 'holiday', label: '🎄 Holiday Campaign' },
          { key: 'bulk', label: '⚡ Bulk Generator' },
        ].map(sec => (
          <button key={sec.key} onClick={() => setActiveSection(sec.key)}
            style={{ padding: "8px 16px", borderRadius: 20, fontSize: 12, border: "1px solid", cursor: "pointer",
              background: activeSection === sec.key ? "#1a1a1a" : "#FFF",
              color: activeSection === sec.key ? "#FFF" : "#666",
              borderColor: activeSection === sec.key ? "#1a1a1a" : "#DDD" }}>
            {sec.label}
          </button>
        ))}
      </div>

      {/* ── SECTION 1: Client Context ── */}
      {activeSection === 'context' && (
        <div>
          <div style={s}>
            <div style={labelStyle}>Full AI Context — {client.name}</div>
            <p style={{ fontSize: 12, color: "#888", marginBottom: 16, lineHeight: 1.6 }}>
              ChatGPT나 Claude에 붙여넣으면 브랜드 설명 없이 바로 작업 가능한 전체 컨텍스트예요.
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button onClick={() => copy(generateClientContext(client), 'context')} style={btnPrimary}>
                {copied === 'context' ? '✓ Copied!' : '📋 Copy Full Context'}
              </button>
              <button onClick={() => downloadMd(generateClientContext(client), `${client.id}_context.md`)} style={btnSecondary}>
                ⬇️ Download .md
              </button>
            </div>
            <div style={{ background: "#F7F5F2", borderRadius: 8, padding: 18, fontSize: 11, lineHeight: 1.8, color: "#555", fontFamily: "monospace", whiteSpace: "pre-wrap", maxHeight: 320, overflowY: "auto" }}>
              {generateClientContext(client)}
            </div>
          </div>

          <div style={s}>
            <div style={labelStyle}>Quick Prompt Copy</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { label: "Instagram Post", prompt: buildQuickPrompt(client, "Instagram Post") },
                { label: "Story", prompt: buildQuickPrompt(client, "Story") },
                { label: "Carousel (5 slides)", prompt: buildQuickPrompt(client, "Carousel (5 slides)") },
                { label: "Caption + Hashtags", prompt: buildQuickPrompt(client, "Caption + Hashtags") },
              ].map((item, i) => (
                <button key={i} onClick={() => copy(item.prompt, `quick_${i}`)}
                  style={{ ...btnSecondary, fontSize: 11 }}>
                  {copied === `quick_${i}` ? '✓ Copied!' : item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── SECTION 2: Holiday Campaign ── */}
      {activeSection === 'holiday' && (
        <div>
          <div style={s}>
            <div style={labelStyle}>Holiday 선택 — {client.name}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8, marginBottom: 20 }}>
              {CANADA_HOLIDAYS.map(h => (
                <button key={h.name} onClick={() => setSelectedHoliday(h)}
                  style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid", cursor: "pointer", textAlign: "left",
                    background: selectedHoliday?.name === h.name ? "#1a1a1a" : "#FFF",
                    color: selectedHoliday?.name === h.name ? "#FFF" : "#333",
                    borderColor: selectedHoliday?.name === h.name ? "#1a1a1a" : "#EEE" }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{h.emoji}</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{h.name}</div>
                  <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>{h.date}</div>
                </button>
              ))}
            </div>

            {selectedHoliday && (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <button onClick={() => copy(generateHolidayCampaign(client, selectedHoliday), 'holiday')} style={btnPrimary}>
                    {copied === 'holiday' ? '✓ Copied!' : `📋 Copy ${selectedHoliday.name} Campaign`}
                  </button>
                  <button onClick={() => downloadMd(generateHolidayCampaign(client, selectedHoliday), `${client.id}_${selectedHoliday.name.replace(/ /g,'_')}.md`)} style={btnSecondary}>
                    ⬇️ Download .md
                  </button>
                </div>
                <div style={{ background: "#F7F5F2", borderRadius: 8, padding: 18, fontSize: 11, lineHeight: 1.8, color: "#555", fontFamily: "monospace", whiteSpace: "pre-wrap", maxHeight: 400, overflowY: "auto" }}>
                  {generateHolidayCampaign(client, selectedHoliday)}
                </div>
              </>
            )}
          </div>
        </div>
      )}


      {/* ── SECTION: Design Prompt ── */}
      {activeSection === 'design' && (
        <div>
          {/* Social formats */}
          <div style={s}>
            <div style={labelStyle}>📱 Social Media</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8, marginBottom: 16 }}>
              {FORMAT_PRESETS.social.map(f => (
                <button key={f.key} onClick={() => setSelectedFormat(f)}
                  style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid", cursor: "pointer", textAlign: "left",
                    background: selectedFormat?.key === f.key ? "#1a1a1a" : "#FFF",
                    color: selectedFormat?.key === f.key ? "#FFF" : "#333",
                    borderColor: selectedFormat?.key === f.key ? "#1a1a1a" : "#EEE" }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{f.emoji}</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{f.label}</div>
                  <div style={{ fontSize: 10, opacity: 0.65, marginTop: 2 }}>{f.size}</div>
                  <div style={{ fontSize: 9, opacity: 0.45, marginTop: 1 }}>{f.ratio}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Print formats */}
          <div style={s}>
            <div style={labelStyle}>🖨️ Print</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8, marginBottom: 16 }}>
              {FORMAT_PRESETS.print.map(f => (
                <button key={f.key} onClick={() => setSelectedFormat(f)}
                  style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid", cursor: "pointer", textAlign: "left",
                    background: selectedFormat?.key === f.key ? "#1a1a1a" : "#FFF",
                    color: selectedFormat?.key === f.key ? "#FFF" : "#333",
                    borderColor: selectedFormat?.key === f.key ? "#1a1a1a" : "#EEE" }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{f.emoji}</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{f.label}</div>
                  <div style={{ fontSize: 10, opacity: 0.65, marginTop: 2 }}>{f.size}</div>
                  <div style={{ fontSize: 9, opacity: 0.45, marginTop: 1 }}>{f.ratio}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Optional holiday layer */}
          {selectedFormat && (
            <div style={s}>
              <div style={labelStyle}>🎄 Holiday 추가 (선택사항)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                <button onClick={() => setDesignHoliday(null)}
                  style={{ padding: "7px 14px", borderRadius: 20, border: "1px solid", fontSize: 11, cursor: "pointer",
                    background: !designHoliday ? "#1a1a1a" : "#FFF",
                    color: !designHoliday ? "#FFF" : "#666",
                    borderColor: !designHoliday ? "#1a1a1a" : "#DDD" }}>
                  없음 (일반)
                </button>
                {CANADA_HOLIDAYS.map(h => (
                  <button key={h.name} onClick={() => setDesignHoliday(h)}
                    style={{ padding: "7px 14px", borderRadius: 20, border: "1px solid", fontSize: 11, cursor: "pointer",
                      background: designHoliday?.name === h.name ? "#1a1a1a" : "#FFF",
                      color: designHoliday?.name === h.name ? "#FFF" : "#666",
                      borderColor: designHoliday?.name === h.name ? "#1a1a1a" : "#DDD" }}>
                    {h.emoji} {h.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Generated prompt */}
          {selectedFormat && (
            <div style={s}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={labelStyle}>생성된 디자인 프롬프트</div>
                  <div style={{ fontSize: 12, color: "#888" }}>
                    {selectedFormat.emoji} {selectedFormat.label} · {selectedFormat.spec}
                    {designHoliday ? ` · ${designHoliday.emoji} ${designHoliday.name}` : ''}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => copy(generateDesignPrompt(client, selectedFormat, designHoliday), 'design')} style={btnPrimary}>
                    {copied === 'design' ? '✓ Copied!' : '📋 Copy Prompt'}
                  </button>
                  <button onClick={() => downloadMd(generateDesignPrompt(client, selectedFormat, designHoliday), `${client.id}_${selectedFormat.key}${designHoliday ? '_' + designHoliday.name.replace(/ /g,'_') : ''}.md`)} style={btnSecondary}>
                    ⬇️ .md
                  </button>
                </div>
              </div>
              <div style={{ background: "#F7F5F2", borderRadius: 8, padding: 18, fontSize: 11, lineHeight: 1.8, color: "#555", fontFamily: "monospace", whiteSpace: "pre-wrap", maxHeight: 420, overflowY: "auto" }}>
                {generateDesignPrompt(client, selectedFormat, designHoliday)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SECTION 3: Bulk Generator ── */}
      {activeSection === 'bulk' && (
        <div>
          <div style={s}>
            <div style={labelStyle}>⚡ Bulk Holiday Campaign Generator</div>
            <p style={{ fontSize: 12, color: "#888", marginBottom: 16, lineHeight: 1.6 }}>
              Holiday 하나 선택하면 — 활성 클라이언트 {allClients.length}개의 캠페인을 한번에 생성해요.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8, marginBottom: 20 }}>
              {CANADA_HOLIDAYS.map(h => (
                <button key={h.name} onClick={() => { setBulkHoliday(h); setBulkGenerated(generateBulkHolidayCampaigns(allClients, h)) }}
                  style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid", cursor: "pointer", textAlign: "left",
                    background: bulkHoliday?.name === h.name ? "#1a1a1a" : "#FFF",
                    color: bulkHoliday?.name === h.name ? "#FFF" : "#333",
                    borderColor: bulkHoliday?.name === h.name ? "#1a1a1a" : "#EEE" }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{h.emoji}</div>
                  <div style={{ fontSize: 11, fontWeight: 600 }}>{h.name}</div>
                  <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>{h.date}</div>
                </button>
              ))}
            </div>

            {bulkGenerated && bulkHoliday && (
              <>
                <div style={{ padding: "12px 16px", background: "#F0FFF4", borderRadius: 10, border: "1px solid #A8E6BA", marginBottom: 16, fontSize: 12, color: "#2D6A4F" }}>
                  ✅ {allClients.length}개 클라이언트 × {bulkHoliday.name} 캠페인 생성 완료
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <button onClick={() => copy(bulkGenerated, 'bulk')} style={btnPrimary}>
                    {copied === 'bulk' ? '✓ Copied!' : '📋 전체 복사'}
                  </button>
                  <button onClick={() => downloadMd(bulkGenerated, `ALL_CLIENTS_${bulkHoliday.name.replace(/ /g,'_')}_campaigns.md`)} style={btnSecondary}>
                    ⬇️ Download All (.md)
                  </button>
                </div>

                {/* Per-client quick copy */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
                  {allClients.map(c => (
                    <button key={c.id} onClick={() => copy(generateHolidayCampaign(c, bulkHoliday), `bulk_${c.id}`)}
                      style={{ padding: "10px 14px", background: "#FFF", borderRadius: 8, border: "1px solid #EEE", fontSize: 11, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{c.emoji}</span>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#333" }}>{c.name}</span>
                      <span style={{ color: copied === `bulk_${c.id}` ? "#4CAF50" : "#BBB", fontSize: 10 }}>
                        {copied === `bulk_${c.id}` ? "✓" : "copy"}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
