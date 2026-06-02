// Vinted Scam Shield v3.0
// Friendly scam detection for casual shoppers

const ANTHROPIC_API_KEY = 'YOUR_API_KEY_HERE'; // Replace with your key

// ─── Quick rule-based checks (instant, no API needed) ─────────────────────

const FAST_FASHION = [
  'shein','romwe','zaful','boohoo','prettylittlething',
  'missguided','fashion nova','temu',
];

// Pseudo-brands resellers use to avoid "no brand" detection
const PSEUDO_BRANDS = [
  'vintage dressing','no brand','sans marque','kein marke','marque inconnue',
  'handmade','fait main','selbstgemacht','artisanal','no name','noname',
  'autre marque','other brand','andere marke',
];

// Dropshipping signals in description
const DROPSHIP_SIGNALS = [
  'ships from china','asian sizing','asia size','2-3 weeks delivery',
  'similicuir','1:1 quality','aaa replica','mirror quality',
  'col mandarin','mandarin collar',
];

// AI-generated description signals
// AI text is typically over-descriptive, uses marketing language,
// and never mentions personal experience or real wear details
const AI_DESCRIPTION_SIGNALS = [
  // English marketing superlatives
  'perfect condition','impeccable condition','pristine condition',
  'excellent quality','premium quality','high quality material',
  'timeless elegance','effortless style','versatile piece',
  'wardrobe staple','must-have','elevate your look',
  'perfect for any occasion','suitable for all occasions',
  'pairs perfectly with','complements any outfit',
  'please note that','kindly note','please be aware',
  'feel free to contact','do not hesitate to contact',
  'this garment','this piece features','this item boasts',
  'crafted from','constructed from','manufactured from',
  // French AI marketing phrases (very common on vinted.at from French resellers)
  'cette elegante','cette élégante','cette magnifique','cette sublime',
  'cette superbe','ce magnifique','ce sublime',
  'coupe cintrée','drapé raffiné','coupe ajustée','silhouette élégante',
  'parfait pour','idéal pour','convient pour toutes',
  'livraison soignée','envoi soigné','livraison rapide et soignée',
  'n hésitez pas','hesitez pas a','contactez moi pour',
  'prix négociable','prix à débattre',
  // German AI phrases
  'elegantes stück','hochwertiges material','perfekter zustand',
  'ideal für','geeignet für alle','kontaktieren sie mich',
  'versand sicher verpackt','sorgfältig verpackt',
];

// ─── State ────────────────────────────────────────────────────────────────
let vssWarned = false;
let vssImageUrl = '';

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getStatus') {
    sendResponse({ warned: vssWarned });
  } else if (request.action === 'getLensUrl') {
    sendResponse({ url: vssImageUrl });
  }
  return true;
});

// ─── Entry point ──────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  if (!window.location.href.includes('/items/')) return;

  // Show checklist early — doesn't need full page data
  setTimeout(() => {
    if (!document.getElementById('vss-checklist')) {
      const earlyItem = { imageUrl: document.querySelector('img[src*="vinted.net"]')?.src || '' };
      showChecklist(earlyItem);
    }
  }, 1000);

  // Full analysis after page settles — 3.5s gives Vinted SPA time to render
  setTimeout(async () => {
    const item = extractItem();
    if (!item) return;

    vssImageUrl = item.imageUrl || vssImageUrl;

    const quickFlag = quickCheck(item);
    const aiResult  = await aiAnalyse(item);
    const combined  = mergeResults(quickFlag, aiResult);
    if (combined) showBanner(combined);
  }, 3500);
});


// ─── Data extraction ──────────────────────────────────────────────────────
function extractItem() {
  const title = document.querySelector('h1')?.textContent.trim()
    || document.querySelector('meta[property="og:title"]')?.content?.replace(' | Vinted','').trim()
    || '';

  const brand = document.querySelector('a[href*="/brand/"]')?.textContent.trim() ?? '';
  const price       = extractPrice();
  const description = extractDescription();
  const reviews     = extractReviews();
  const photoCount  = document.querySelectorAll('img[src*="vinted"]').length;
  const imageUrl    = document.querySelector('img[src*="images1.vinted"]')?.src ?? '';

  const pageText = document.body.innerText;
  const isFrequentUploader = (
    pageText.includes('Häufige Uploads') ||
    pageText.includes('Frequent uploads') ||
    pageText.includes('Upload fréquent') ||
    pageText.includes('Caricamenti frequenti')
  );

  const brandLower = brand.toLowerCase();
  const isPseudoBrand = PSEUDO_BRANDS.some(p => brandLower.includes(p));
  const brandIsFakeOrMissing = !brand || brand.length > 40 ||
    brand === title || isPseudoBrand;

  vssImageUrl = imageUrl;
  return { title, brand, price, description, reviews, photoCount, imageUrl, isFrequentUploader, brandIsFakeOrMissing };
}

function extractPrice() {
  const lines = document.body.innerText.split('\n').map(l => l.trim()).filter(Boolean);
  const idx = lines.findIndex(l =>
    l.includes('Käuferschutz') || l.includes('buyer protection') || l.includes('protection acheteur')
  );
  if (idx > 0) {
    for (let i = idx - 1; i >= Math.max(0, idx - 6); i--) {
      const m = lines[i].match(/^([\d.,]+)\s*€$/);
      if (m) {
        const val = parseFloat(m[1].replace(',', '.'));
        if (val >= 1 && val <= 10000) return val;
      }
    }
  }
  const allPrices = [];
  const priceRegex = /\b([\d]{1,4}(?:[.,]\d{2})?)\s*€/g;
  let match;
  while ((match = priceRegex.exec(document.body.innerText)) !== null) {
    const val = parseFloat(match[1].replace(',', '.'));
    if (val >= 3 && val <= 10000) allPrices.push(val);
  }
  if (allPrices.length === 0) return null;
  const itemPrices = allPrices.filter(p => p >= 20);
  if (itemPrices.length > 0) return Math.min(...itemPrices);
  return Math.min(...allPrices);
}

function extractDescription() {
  const meta = document.querySelector('meta[name="description"], meta[property="og:description"]');
  if (meta && meta.content && meta.content.length > 20) {
    const full = meta.content;
    const dashIdx = full.indexOf(' - ');
    const desc = dashIdx > -1 ? full.slice(dashIdx + 3) : full;
    return desc.toLowerCase().slice(0, 800);
  }
  let best = '';
  document.querySelectorAll('span, p').forEach(el => {
    const t = el.textContent.trim();
    if (t.length > best.length && t.length < 2000 && !t.includes('cookie')) best = t;
  });
  return best.toLowerCase().slice(0, 800);
}

function extractReviews() {
  const bodyText = document.body.innerText;
  if (
    bodyText.includes('Noch keine Bewertungen') ||
    bodyText.includes('No reviews yet') ||
    bodyText.includes('Pas encore d\'avis') ||
    bodyText.includes('Nessuna recensione') ||
    bodyText.includes('Geen beoordelingen')
  ) return 0;
  const lines = bodyText.split('\n').map(l => l.trim()).filter(Boolean);
  const idx = lines.findIndex(l =>
    l.includes('Zuletzt online') || l.includes('Last seen') ||
    l.includes('Dernière connexion') || l.includes('Ultimo accesso')
  );
  if (idx < 2) return null;
  for (let offset = 1; offset <= 5; offset++) {
    const n = parseInt(lines[idx - offset]);
    if (!isNaN(n) && n >= 0 && n < 50000) return n;
  }
  return null;
}

// ─── Quick check function ─────────────────────────────────────────────────
function quickCheck(item) {
  const text  = (item.title + ' ' + item.description + ' ' + item.brand).toLowerCase();
  const title = item.title.toLowerCase();
  const brand = item.brand.toLowerCase();

  // ── 1. New seller warning (under 10 reviews, any price) ──────────────────
  if (item.reviews !== null && item.reviews < 10) {
    const reviewText = item.reviews === 0
      ? 'This seller has no reviews yet'
      : `This seller has only ${item.reviews} review(s)`;
    return {
      level: 'warning',
      headline: 'New seller — take extra care',
      reason: `${reviewText}. Always ask for additional photos and pay through Vinted only.`,
      tip: 'Ask for a photo of the label and item next to a handwritten note with today the date.',
    };
  }

  // ── 2. Fake vintage fast fashion ─────────────────────────────────────────
  const claimsVintage = /\b(vintage|y2k|retro|00s|90s|80s)\b/.test(title);
  if (claimsVintage) {
    for (const ff of FAST_FASHION) {
      if (brand.includes(ff) || text.includes(ff)) {
        return {
          level: 'warning',
          headline: 'Fast fashion sold as "vintage"',
          reason: `${item.brand || 'This brand'} is modern fast fashion, not genuine vintage. The "vintage" label here is misleading.`,
          tip: 'Check the images with Google Lens — the item is likely worth a few euros on Shein.',
        };
      }
    }
  }

  // ── 3. Dropshipping keywords ──────────────────────────────────────────────
  const foundDropship = DROPSHIP_SIGNALS.filter(s => text.includes(s));
  if (foundDropship.length >= 2) {
    return {
      level: 'warning',
      headline: 'Possible Shein / Temu resale',
      reason: `The description contains phrases often used by resellers: "${foundDropship.slice(0,2).join('", "')}"`,
      tip: 'Reverse-image search the photos before buying.',
    };
  }

  // ── 4. Shein/Temu reseller fingerprint ───────────────────────────────────
  // Frequent uploader + no real brand + low reviews
  const brandLower = brand.toLowerCase();
  const isPseudoBrand = PSEUDO_BRANDS.some(p => brandLower.includes(p));
  const brandIsFakeOrMissing = !brand || brand.length > 40 ||
    brand === item.title || isPseudoBrand;
  const isLowReviewSeller = item.reviews !== null && item.reviews < 50;
  const isTemplateDescription = (item.description || '').trim().split(' ').filter(Boolean).length < 25;

  if (item.isFrequentUploader && brandIsFakeOrMissing && isLowReviewSeller) {
    return {
      level: 'warning',
      headline: 'Possible Shein or Temu reseller',
      reason: 'This seller uploads frequently, has relatively few reviews, and the item has no real brand listed — a common pattern for resellers buying cheap items from Shein or Temu.',
      tip: 'Click "Check Images" to reverse-search the photo — you may find the same item for €3–8 on Shein.',
    };
  }

  // ── 5. AI-generated description ──────────────────────────────────────────
  const aiSignalsFound = AI_DESCRIPTION_SIGNALS.filter(s => text.includes(s));
  // Hashtag count — count linked hashtags in page DOM, not just description text
  // Vinted renders hashtags as <a href="/catalog?search_text=%23..."> links
  const hashtagLinks = document.querySelectorAll('a[href*="search_text=%23"]');
  const hashtagCount = hashtagLinks.length;

  // AI description: 3+ AI signals OR 6+ hashtags OR both combined
  if (aiSignalsFound.length >= 3 || hashtagCount >= 6 || (aiSignalsFound.length >= 2 && hashtagCount >= 3)) {
    const reason = hashtagCount >= 6
      ? `This description contains ${hashtagCount} hashtags and marketing language — typical of AI-generated or copy-paste reseller listings, not genuine second-hand sellers.`
      : `This description uses ${aiSignalsFound.length} AI marketing phrases ("${aiSignalsFound.slice(0,2).join('", "')}") — unlikely to be written by a genuine second-hand seller.`;
    return {
      level: 'warning',
      headline: 'Description looks AI-generated',
      reason: reason,
      tip: 'Real sellers describe their item personally — flaws, fit, why they are selling. Ask the seller a specific question about the item.',
    };
  }

  return null;
}

// ─── AI analysis via Claude ───────────────────────────────────────────────
async function aiAnalyse(item) {
  if (ANTHROPIC_API_KEY === 'YOUR_API_KEY_HERE') return null;
  if (!item.title && !item.description) return null;

  const prompt = `You are an expert in second-hand fashion marketplace scams, specifically on Vinted in Europe (vinted.at, vinted.de, vinted.fr, vinted.co.uk and other regional versions).

You have deep knowledge of these specific scam patterns on Vinted:

1. SHEIN/TEMU RESELLERS
   - Buy cheap items (€3-15) from Shein, Temu or AliExpress and resell at 3-10x markup
   - Telltale signs: no real brand listed or brand field contains the item title, frequent uploads badge, few reviews, descriptions in French/English with marketing language, excessive hashtags (6+), phrases like "jamais porté", "envoi soigné", "livraison rapide", "cette élégante"
   - Profile bios like "je vends des vêtements de bonnes qualité" are copy-paste templates used across many reseller accounts

2. AI-GENERATED DESCRIPTIONS
   - Resellers use ChatGPT to write descriptions — sounds polished but impersonal
   - Signs: marketing superlatives ("élégante", "raffiné", "polyvalent", "intemporel"), no mention of personal experience, no flaws mentioned, ends with hashtag spam
   - Real second-hand sellers write casually: mention why selling, describe fit on their body, note small flaws

3. FAKE VINTAGE / Y2K
   - Modern fast fashion (Shein, Zara, H&M) labeled as "vintage", "Y2K", "retro", "90s"
   - Genuine vintage items have specific brand history; resellers use vague vintage claims

4. COUNTERFEIT LUXURY
   - Fake designer items (Dior, Chanel, Louis Vuitton, Gucci etc.) from new or low-review sellers
   - Real luxury items have detailed descriptions mentioning authenticity, provenance, condition of hardware/stitching
   - Counterfeits have vague descriptions, no mention of authenticity card, receipt or box

5. SUSPICIOUS SELLER PATTERNS
   - New account (0-10 reviews) selling expensive items
   - High upload frequency with few current listings (lists and delists constantly)
      - Follower/following ratio heavily skewed (50 followers, 0 following = commercial account)

LISTING TO ANALYSE:
- Title: ${item.title}
- Brand: ${item.brand || 'not listed'}
- Price: ${item.price ? '€' + item.price : 'unknown'}
- Seller reviews: ${item.reviews ?? 'unknown'}
- Seller badges visible: ${item.isFrequentUploader ? 'Frequent uploads' : 'none detected'}
- Photo count: ${item.photoCount}
- Description: ${item.description.slice(0, 600)}

IMPORTANT CONTEXT:
- You are protecting casual shoppers who may not know these patterns
- Only flag if you have genuine reason — do not flag legitimate second-hand sellers
- A real person clearing their wardrobe writes personally: mentions fit, why selling, small flaws
- A reseller writes like a product listing: marketing language, no personal details, hashtags

Respond ONLY with valid JSON, no markdown, no explanation outside the JSON:
{
  "risky": true or false,
  "level": "warning" or "danger",
  "headline": "max 8 words, friendly not alarming",
  "reason": "one plain sentence explaining the specific red flag you found",
  "tip": "one concrete action the buyer can take right now"
}

If the listing looks like a genuine second-hand seller, respond only with: {"risky": false}
Be conservative — it is better to miss a scam than to falsely accuse a legitimate seller.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text = data.content?.[0]?.text?.trim();
    if (!text) return null;

    const json = JSON.parse(text.replace(/```json|```/g, '').trim());
    return json.risky ? json : null;
  } catch {
    return null;
  }
}

// ─── Merge quick + AI results ─────────────────────────────────────────────
function mergeResults(quick, ai) {
  // Danger always wins
  if (quick?.level === 'danger') return quick;
  if (ai?.level === 'danger')    return ai;
  // Then warnings — prefer AI's richer language when available
  if (ai?.level === 'warning')   return ai;
  if (quick?.level === 'warning') return quick;
  return null;
}

// ─── Banner UI ─────────────────────────────────────────────────────────────
function showBanner(result) {
  const existing = document.getElementById('vss-banner');
  if (existing) existing.remove();

  const isDanger = result.level === 'danger';
  const accent   = isDanger ? '#E53935' : '#F57C00';
  const bgTop    = isDanger ? '#FFF5F5' : '#FFFBF2';
  const emoji    = isDanger ? '🚨' : '⚠️';

  const banner = document.createElement('div');
  banner.id = 'vss-banner';
  banner.style.cssText = [
    'position:fixed', 'top:72px', 'right:20px', 'width:340px',
    'background:' + bgTop,
    'border:1.5px solid ' + accent + '33',
    'border-left:4px solid ' + accent,
    'border-radius:14px',
    'box-shadow:0 8px 32px ' + accent + '22, 0 2px 8px rgba(0,0,0,0.08)',
    'z-index:999999',
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    'overflow:hidden',
    'animation:vssBannerIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both',
  ].join(';');

  // Build HTML via DOM to avoid template literal / escaping issues
  banner.innerHTML = '<style>'
    + '@keyframes vssBannerIn{from{opacity:0;transform:translateX(30px) scale(0.96)}to{opacity:1;transform:translateX(0) scale(1)}}'
    + '#vss-banner button{cursor:pointer;font-family:inherit}'
    + '</style>';

  // ── Header ──
  const header = document.createElement('div');
  header.style.cssText = 'padding:16px 16px 0;';

  const headerRow = document.createElement('div');
  headerRow.style.cssText = 'display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;';

  const emojiEl = document.createElement('span');
  emojiEl.style.cssText = 'font-size:22px;line-height:1;';
  emojiEl.textContent = emoji;

  const titleWrap = document.createElement('div');
  titleWrap.style.cssText = 'flex:1;';

  const headline = document.createElement('div');
  headline.style.cssText = 'font-size:14px;font-weight:700;color:' + accent + ';line-height:1.3;margin-bottom:3px;';
  headline.textContent = result.headline;

  const badge = document.createElement('div');
  badge.style.cssText = 'font-size:10px;font-weight:600;letter-spacing:.6px;color:' + accent + '99;text-transform:uppercase;';
  badge.textContent = 'Vinted Scam Shield';

  titleWrap.appendChild(headline);
  titleWrap.appendChild(badge);

  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'background:none;border:none;padding:4px 6px;border-radius:6px;color:#999;font-size:16px;line-height:1;';
  closeBtn.textContent = '✕';
  closeBtn.onclick = () => banner.remove();

  headerRow.appendChild(emojiEl);
  headerRow.appendChild(titleWrap);
  headerRow.appendChild(closeBtn);

  // ── Reason ──
  const reason = document.createElement('div');
  reason.style.cssText = 'font-size:13px;color:#444;line-height:1.55;margin-bottom:10px;padding-left:32px;';
  reason.textContent = result.reason;

  // ── Tip chip ──
  const tip = document.createElement('div');
  tip.style.cssText = 'display:flex;align-items:flex-start;gap:8px;background:' + accent + '0f;border-radius:8px;padding:10px 12px;margin-bottom:14px;';
  const tipIcon = document.createElement('span');
  tipIcon.style.cssText = 'font-size:14px;margin-top:1px;';
  tipIcon.textContent = '💡';
  const tipText = document.createElement('span');
  tipText.style.cssText = 'font-size:12px;color:#555;line-height:1.5;';
  tipText.textContent = result.tip;
  tip.appendChild(tipIcon);
  tip.appendChild(tipText);

  header.appendChild(headerRow);
  header.appendChild(reason);
  header.appendChild(tip);
  banner.appendChild(header);

  // ── Action buttons ──
  const actions = document.createElement('div');
  actions.style.cssText = 'padding:0 12px 10px;display:flex;gap:8px;';

  const lensBtn = document.createElement('button');
  lensBtn.style.cssText = 'flex:1;padding:9px 0;background:none;border:1.5px solid #1a73e8;border-radius:9px;font-size:12px;font-weight:600;color:#1a73e8;';
  lensBtn.textContent = '🔍 Check Images';
  lensBtn.onclick = () => {
    const img = document.querySelector('img[data-testid="item-photo"]')?.src
              ?? document.querySelector('main img[src*="vinted"]')?.src;
    if (img) window.open('https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(img), '_blank');
  };

  const dismissBtn = document.createElement('button');
  dismissBtn.style.cssText = 'flex:1;padding:9px 0;background:none;border:1.5px solid #ddd;border-radius:9px;font-size:12px;font-weight:600;color:#888;';
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.onclick = () => banner.remove();

  actions.appendChild(lensBtn);
  actions.appendChild(dismissBtn);
  banner.appendChild(actions);

  // ── Feedback row ──
  const feedbackWrap = document.createElement('div');
  feedbackWrap.style.cssText = 'padding:0 12px 14px;';

  const feedbackInner = document.createElement('div');
  feedbackInner.style.cssText = 'border-top:1px solid #f0f0f0;padding-top:10px;display:flex;align-items:center;gap:8px;';

  // Detect language from page
  const t = { helpful: 'Helpful?', yes: '✓ Yes', no: '✗ No', thanks: '✓ Thanks!', noted: '✗ Thanks!' };

  const feedbackLabel = document.createElement('span');
  feedbackLabel.style.cssText = 'font-size:11px;color:#aaa;flex:1;';
  feedbackLabel.textContent = t.helpful;

  const btnBase = 'padding:5px 12px;background:none;border:1.5px solid #e0e0e0;border-radius:20px;font-size:12px;color:#666;font-weight:600;letter-spacing:.2px;';

  const helpfulBtn = document.createElement('button');
  helpfulBtn.style.cssText = btnBase;
  helpfulBtn.textContent = t.yes;
  helpfulBtn.onclick = () => {
    saveFeedback('helpful');
    helpfulBtn.style.background = '#E8F5E9';
    helpfulBtn.style.borderColor = '#4CAF50';
    helpfulBtn.style.color = '#2E7D32';
    helpfulBtn.textContent = t.thanks;
    wrongBtn.style.display = 'none';
    setTimeout(() => banner.remove(), 1500);
  };

  const wrongBtn = document.createElement('button');
  wrongBtn.style.cssText = btnBase;
  wrongBtn.textContent = t.no;
  wrongBtn.onclick = () => {
    saveFeedback('wrong');
    wrongBtn.style.background = '#FFF3E0';
    wrongBtn.style.borderColor = '#FF9800';
    wrongBtn.style.color = '#E65100';
    wrongBtn.textContent = t.noted;
    helpfulBtn.style.display = 'none';
    setTimeout(() => banner.remove(), 1500);
  };

  feedbackInner.appendChild(feedbackLabel);
  feedbackInner.appendChild(helpfulBtn);
  feedbackInner.appendChild(wrongBtn);
  feedbackWrap.appendChild(feedbackInner);
  banner.appendChild(feedbackWrap);

  vssWarned = true; // tell popup a warning was shown
  document.body.appendChild(banner);
}


// ─── Before-you-buy Checklist ─────────────────────────────────────────────
function showChecklist(item) {
  if (document.getElementById('vss-checklist')) return;

  const imageUrl = item.imageUrl || '';

  const CHECKS = [
    {
      id: 'tag',
      icon: '🏷️',
      label: 'Label or tag photo is visible',
      hint: 'A clear photo of the clothing tag proves the real brand and size. If missing, ask the seller before buying — genuine sellers always have it.',
    },
    {
      id: 'lens',
      icon: '🔍',
      label: 'Checked images with Google Lens',
      hint: 'Reverse-search the photos to see if they appear on Shein, Temu, AliExpress, or other sites.',
      hasButton: true,
    },
    {
      id: 'description',
      icon: '📝',
      label: 'Description sounds personal, not AI',
      hint: 'Real sellers mention why they are selling, how it fits, any small flaws. AI or copy-paste descriptions are full of marketing language and hashtags.',
    },
    {
      id: 'platform',
      icon: '🔒',
      label: 'Paying through Vinted only',
      hint: 'Never pay or communicate outside Vinted. You lose all buyer protection the moment you do.',
    },
    {
      id: 'creditcard',
      icon: '💳',
      label: 'Paying with a credit card',
      hint: 'Credit cards offer chargeback protection — if the item is fake or never arrives, your bank can reverse the payment. Debit cards and bank transfers offer much less protection.',
    },
  ];

  // ── Wrapper ──
  const wrap = document.createElement('div');
  wrap.id = 'vss-checklist';
  wrap.style.cssText = [
    'position:fixed',
    'bottom:20px',
    'left:20px',
    'width:300px',
    'background:white',
    'border:1.5px solid #e0e0e0',
    'border-radius:14px',
    'box-shadow:0 4px 20px rgba(0,0,0,0.10)',
    'z-index:999998',
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    'overflow:hidden',
    'transition:all .25s ease',
  ].join(';');

  // ── Header (always visible, click to toggle) ──
  const header = document.createElement('div');
  header.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:8px',
    'padding:12px 14px',
    'cursor:pointer',
    'user-select:none',
    'background:white',
  ].join(';');

  const shield = document.createElement('span');
  shield.textContent = '🛡️';
  shield.style.cssText = 'font-size:16px;flex-shrink:0;';

  const headerText = document.createElement('div');
  headerText.style.cssText = 'flex:1;';

  const headerTitle = document.createElement('div');
  headerTitle.style.cssText = 'font-size:13px;font-weight:700;color:#09B1BA;';
  headerTitle.textContent = 'Before you buy — 5 checks';

  const headerSub = document.createElement('div');
  headerSub.style.cssText = 'font-size:10px;color:#aaa;margin-top:1px;';
  headerSub.textContent = 'Tap to expand';
  headerSub.id = 'vss-checklist-sub';

  headerText.appendChild(headerTitle);
  headerText.appendChild(headerSub);

  const chevron = document.createElement('span');
  chevron.id = 'vss-chevron';
  chevron.style.cssText = 'font-size:12px;color:#aaa;transition:transform .2s;';
  chevron.textContent = '▲';

  const closeX = document.createElement('button');
  closeX.style.cssText = 'background:none;border:none;color:#ccc;font-size:14px;cursor:pointer;padding:0 0 0 6px;line-height:1;';
  closeX.textContent = '✕';
  closeX.title = 'Dismiss';
  closeX.onclick = (e) => { e.stopPropagation(); wrap.remove(); };

  header.appendChild(shield);
  header.appendChild(headerText);
  header.appendChild(chevron);
  header.appendChild(closeX);

  // ── Body (collapsible) ──
  const body = document.createElement('div');
  body.id = 'vss-checklist-body';
  body.style.cssText = [
    'border-top:1px solid #f0f0f0',
    'padding:10px 14px 14px',
    'display:none',
  ].join(';');

  // Progress bar
  const progressWrap = document.createElement('div');
  progressWrap.style.cssText = 'background:#f0f0f0;border-radius:4px;height:4px;margin-bottom:12px;overflow:hidden;';
  const progressBar = document.createElement('div');
  progressBar.id = 'vss-progress';
  progressBar.style.cssText = 'height:4px;width:0%;background:linear-gradient(90deg,#09B1BA,#4CAF50);border-radius:4px;transition:width .3s ease;';
  progressWrap.appendChild(progressBar);
  body.appendChild(progressWrap);

  // Checklist items
  let checkedCount = 0;

  CHECKS.forEach((check) => {
    const row = document.createElement('div');
    row.style.cssText = [
      'display:flex',
      'align-items:flex-start',
      'gap:10px',
      'padding:7px 0',
      'border-bottom:1px solid #f8f8f8',
      'cursor:pointer',
    ].join(';');

    const checkbox = document.createElement('div');
    checkbox.id = 'vss-check-' + check.id;
    checkbox.style.cssText = [
      'width:18px',
      'height:18px',
      'border:2px solid #ddd',
      'border-radius:5px',
      'flex-shrink:0',
      'margin-top:1px',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'font-size:11px',
      'transition:all .15s',
      'background:white',
    ].join(';');

    const labelWrap = document.createElement('div');
    labelWrap.style.cssText = 'flex:1;';

    const labelRow = document.createElement('div');
    labelRow.style.cssText = 'display:flex;align-items:center;gap:6px;';

    const icon = document.createElement('span');
    icon.style.cssText = 'font-size:14px;';
    icon.textContent = check.icon;

    const labelText = document.createElement('span');
    labelText.style.cssText = 'font-size:12px;font-weight:600;color:#333;';
    labelText.textContent = check.label;

    labelRow.appendChild(icon);
    labelRow.appendChild(labelText);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px;color:#888;line-height:1.4;margin-top:3px;';
    hint.textContent = check.hint;

    labelWrap.appendChild(labelRow);
    labelWrap.appendChild(hint);

    // Google Lens button for image check
    if (check.hasButton && imageUrl) {
      const lensBtn = document.createElement('button');
      lensBtn.style.cssText = [
        'display:block',
        'margin-top:6px',
        'padding:5px 10px',
        'background:none',
        'border:1.5px solid #1a73e8',
        'border-radius:7px',
        'font-size:11px',
        'font-weight:600',
        'color:#1a73e8',
        'cursor:pointer',
        'font-family:inherit',
      ].join(';');
      lensBtn.textContent = '🔍 Open Google Lens';
      lensBtn.onclick = (e) => {
        e.stopPropagation();
        window.open('https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(imageUrl), '_blank');
        // Auto-tick this check when they click
        if (!checkbox.dataset.checked) {
          checkbox.click();
        }
      };
      labelWrap.appendChild(lensBtn);
    }

    // Toggle check on row click
    row.onclick = () => {
      if (checkbox.dataset.checked) {
        delete checkbox.dataset.checked;
        checkbox.style.background = 'white';
        checkbox.style.borderColor = '#ddd';
        checkbox.textContent = '';
        checkedCount = Math.max(0, checkedCount - 1);
      } else {
        checkbox.dataset.checked = '1';
        checkbox.style.background = '#4CAF50';
        checkbox.style.borderColor = '#4CAF50';
        checkbox.textContent = '✓';
        checkbox.style.color = 'white';
        checkedCount++;
      }
      // Update progress
      const pct = (checkedCount / CHECKS.length) * 100;
      progressBar.style.width = pct + '%';
      // Update subtitle
      const sub = document.getElementById('vss-checklist-sub');
      if (sub) {
        if (checkedCount === CHECKS.length) {
          sub.textContent = 'All checks done ✓';
          sub.style.color = '#4CAF50';
        } else {
          sub.textContent = checkedCount + ' of ' + CHECKS.length + ' checked';
          sub.style.color = '#aaa';
        }
      }
    };

    row.appendChild(checkbox);
    row.appendChild(labelWrap);
    body.appendChild(row);
  });

  // ── Pro AI analysis teaser ──
  const proRow = document.createElement('div');
  proRow.style.cssText = [
    'margin-top:10px',
    'padding:10px',
    'background:#F8F9FF',
    'border:1.5px solid #E8EAFF',
    'border-radius:9px',
    'display:flex',
    'align-items:center',
    'gap:8px',
  ].join(';');

  const proIcon = document.createElement('span');
  proIcon.style.cssText = 'font-size:18px;';
  proIcon.textContent = '🤖';

  const proText = document.createElement('div');
  proText.style.cssText = 'flex:1;';

  const proTitle = document.createElement('div');
  proTitle.style.cssText = 'font-size:12px;font-weight:700;color:#5C6BC0;';
  proTitle.textContent = 'AI analysis — coming soon';

  const proSub = document.createElement('div');
  proSub.style.cssText = 'font-size:11px;color:#888;margin-top:2px;';
  proSub.textContent = 'Let AI check this listing for you automatically.';

  proText.appendChild(proTitle);
  proText.appendChild(proSub);
  proRow.appendChild(proIcon);
  proRow.appendChild(proText);
  body.appendChild(proRow);

  // ── Toggle logic ──
  let isOpen = false;
  header.addEventListener('click', () => {
    isOpen = !isOpen;
    body.style.display = isOpen ? 'block' : 'none';
    chevron.style.transform = isOpen ? 'rotate(180deg)' : '';
    const sub = document.getElementById('vss-checklist-sub');
    if (sub && checkedCount === 0) {
      sub.textContent = isOpen ? 'Tick each item as you check' : 'Tap to expand';
    }
  });

  wrap.appendChild(header);
  wrap.appendChild(body);
  document.body.appendChild(wrap);
}

function saveFeedback(type) {
  chrome.storage.local.get(['vssFeedback'], (result) => {
    const fb = result.vssFeedback || { helpful: 0, wrong: 0 };
    fb[type]++;
    chrome.storage.local.set({ vssFeedback: fb });
  });
}
