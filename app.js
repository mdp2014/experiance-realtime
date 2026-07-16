import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const SUPABASE_URL = "https://jffxwtrixzqacllfndxb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmZnh3dHJpeHpxYWNsbGZuZHhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMDg4OTksImV4cCI6MjA5OTc4NDg5OX0.7kxUfnLgjqCPa2pfSaqmH7kk6E0Vbb8zxIXPrJz8t1U";

const RANDOM_NAMES = [
  "Nova",
  "Luna",
  "Pixel",
  "Sora",
  "Mika",
  "Zed",
  "Astra",
  "Cleo",
  "Nico",
  "Ari"
];

const app = {
  client: null,
  userId: null,
  username: "",
  color: "#7c3aed",
  presenceChannel: null,
  cursorChannel: null,
  chatChannel: null,
  remoteUsers: new Map(),
  remoteCursors: new Map(),
  lastCursorSendAt: 0,
  lastPresenceTrackAt: 0,
  chatFeed: [],
  connected: false,
};

const elements = {
  usernameInput: document.querySelector("#username-input"),
  colorInput: document.querySelector("#color-input"),
  connectBtn: document.querySelector("#connect-btn"),
  randomNameBtn: document.querySelector("#random-name-btn"),
  cursorLayer: document.querySelector("#cursor-layer"),
  onlineCount: document.querySelector("#online-count"),
  statusPill: document.querySelector("#status-pill"),
  connectionText: document.querySelector("#connection-text"),
  chatFeed: document.querySelector("#chat-feed"),
  chatForm: document.querySelector("#chat-form"),
  chatInput: document.querySelector("#chat-input"),
  surfaceArea: document.querySelector("#surface-area"),
  themeToggle: document.querySelector("#theme-toggle"),
  chatIndicator: document.querySelector("#chat-indicator"),
  toast: document.querySelector("#toast"),
  emojiButtons: [...document.querySelectorAll("[data-emoji]")],
};

function randomColor() {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 72;
  const lightness = 57;
  const rgb = hslToHex(hue, saturation, lightness);
  return rgb;
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (value) => Math.round((value + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function randomName() {
  return RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)] + "-" + Math.floor(Math.random() * 99);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("show"), 2200);
}

function setUserIdentity() {
  app.username = elements.usernameInput.value.trim() || localStorage.getItem("realtime-username") || randomName();
  const savedColor = localStorage.getItem("realtime-color") || elements.colorInput.value;
  app.color = (elements.colorInput.value || savedColor || randomColor()).startsWith("#")
    ? (elements.colorInput.value || savedColor || randomColor())
    : randomColor();

  app.userId = sessionStorage.getItem("realtime-session-id") || crypto.randomUUID();
  sessionStorage.setItem("realtime-session-id", app.userId);

  localStorage.setItem("realtime-username", app.username);
  localStorage.setItem("realtime-color", app.color);

  elements.usernameInput.value = app.username;
  elements.colorInput.value = app.color;
}

function updateTheme() {
  const isLight = document.body.classList.toggle("light", localStorage.getItem("theme-mode") === "light");
  elements.themeToggle.textContent = isLight ? "☀️" : "🌙";
}

function buildCursorNode(userId, username, color, x, y) {
  const node = document.createElement("div");
  node.className = "cursor-object";
  node.dataset.userId = userId;

  const label = document.createElement("div");
  label.className = "cursor-name";
  label.style.background = color;
  label.textContent = username;

  const dot = document.createElement("div");
  dot.className = "cursor-dot";
  dot.style.background = color;

  node.append(label, dot);
  elements.cursorLayer.appendChild(node);
  return node;
}

function moveCursorNode(userId, x, y) {
  const node = app.remoteCursors.get(userId);
  if (!node) return;
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
}

function removeCursorNode(userId) {
  const node = app.remoteCursors.get(userId);
  if (node) {
    node.remove();
    app.remoteCursors.delete(userId);
  }
}

function updateOnlineCount() {
  const count = app.remoteUsers.size + (app.connected ? 1 : 0);
  const typingUsers = [...app.remoteUsers.values()].filter((user) => user.typing).map((user) => user.username);

  elements.onlineCount.textContent = `${count} en ligne`;
  elements.chatIndicator.textContent = typingUsers.length
    ? `${typingUsers[0]} écrit…`
    : "Prêt pour le chat";
}

function setStatus(connected, message) {
  elements.statusPill.textContent = connected ? "Connecté" : "Pas connecté";
  elements.statusPill.style.color = connected ? "#22c55e" : "#f8fafc";
  elements.connectionText.textContent = message;
}

function syncRemotePresence() {
  const current = app.remoteUsers;
  for (const [id, user] of current.entries()) {
    if (!user.node) {
      const node = buildCursorNode(id, user.username, user.color, user.x, user.y);
      user.node = node;
      app.remoteCursors.set(id, node);
    }
    moveCursorNode(id, user.x, user.y);
  }
  updateOnlineCount();
}

function handlePresenceSync() {
  const snapshot = app.presenceChannel.presenceState();
  const nextUsers = new Map();

  for (const [channelUserId, entries] of Object.entries(snapshot)) {
    const presence = entries[0];
    if (channelUserId === app.userId) continue;

    nextUsers.set(channelUserId, {
      username: presence.username,
      color: presence.color,
      x: presence.x ?? 0,
      y: presence.y ?? 0,
      typing: Boolean(presence.typing),
    });
  }

  const oldIds = [...app.remoteUsers.keys()];
  const nextIds = [...nextUsers.keys()];

  oldIds.forEach((id) => {
    if (!nextIds.includes(id)) {
      removeCursorNode(id);
    }
  });

  app.remoteUsers = nextUsers;
  syncRemotePresence();
  updateOnlineCount();
}

function triggerReaction(emoji, userId) {
  const user = app.remoteUsers.get(userId);
  if (!user || !user.node) return;

  const reaction = document.createElement("div");
  reaction.className = "reaction-pop";
  reaction.textContent = emoji;
  user.node.appendChild(reaction);
  setTimeout(() => reaction.remove(), 1300);
}

function renderChatMessages(messages) {
  elements.chatFeed.innerHTML = "";
  messages.slice().reverse().forEach((message) => {
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.innerHTML = `<strong style="color:${message.color}">${message.username}</strong> ${message.message}`;
    elements.chatFeed.appendChild(bubble);
  });
  elements.chatFeed.scrollTop = elements.chatFeed.scrollHeight;
}

async function connectToSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    showToast("Configure la clé anonyme Supabase dans app.js pour activer le flux temps réel.");
    setStatus(false, "Clé anon manquante");
    return;
  }

  app.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    app.presenceChannel = app.client.channel("cursor-presence", {
      config: { presence: { key: app.userId } },
    });

    app.presenceChannel.on("presence", { event: "sync" }, handlePresenceSync);
    app.presenceChannel.on("presence", { event: "join" }, handlePresenceSync);
    app.presenceChannel.on("presence", { event: "leave" }, handlePresenceSync);

    await app.presenceChannel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        app.connected = true;
        setStatus(true, "Supabase connecté");
        await app.presenceChannel.track({
          username: app.username,
          color: app.color,
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
        handlePresenceSync();
      }
    });

    app.cursorChannel = app.client.channel("realtime-cursor");
    app.cursorChannel.on("broadcast", { event: "cursor" }, (payload) => {
      const user = app.remoteUsers.get(payload.userId);
      if (!user) return;
      user.x = payload.x;
      user.y = payload.y;
      moveCursorNode(payload.userId, payload.x, payload.y);
    });

    app.cursorChannel.on("broadcast", { event: "reaction" }, (payload) => {
      triggerReaction(payload.emoji, payload.userId);
    });

    await app.cursorChannel.subscribe();

    app.chatChannel = app.client.channel("chat-updates");
    app.chatChannel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_messages" },
      async (payload) => {
        const message = payload.new;
        if (message.username === app.username && message.message === app.chatFeed.at(-1)?.message) {
          return;
        }
        app.chatFeed.push(message);
        renderChatMessages(app.chatFeed.slice(-30));
      }
    );

    await app.chatChannel.subscribe();

    const { data, error } = await app.client.from("chat_messages").select("*").order("created_at", { ascending: false }).limit(20);
    if (!error) {
      app.chatFeed = data ?? [];
      renderChatMessages(app.chatFeed);
    }

    handlePresenceSync();
    showToast("Flux temps réel prêt");
  } catch (error) {
    console.error(error);
    setStatus(false, "Erreur de connexion Supabase");
    showToast("Connexion Supabase impossible — vérifiez vos clés.");
  }
}

function updateBroadcastCursor(x, y) {
  if (!app.cursorChannel || !app.connected) return;

  const now = performance.now();
  if (now - app.lastCursorSendAt < 18) return;
  app.lastCursorSendAt = now;

  app.cursorChannel.send({
    type: "broadcast",
    event: "cursor",
    payload: { userId: app.userId, username: app.username, color: app.color, x, y },
  });

  if (now - app.lastPresenceTrackAt < 120) return;
  app.lastPresenceTrackAt = now;

  app.presenceChannel.track({
    username: app.username,
    color: app.color,
    x,
    y,
    typing: false,
  });
}

function handlePointerMove(event) {
  const rect = elements.surfaceArea.getBoundingClientRect();
  const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
  const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
  updateBroadcastCursor(x, y);
}

function sendReaction(emoji) {
  if (!app.cursorChannel || !app.connected) {
    showToast("Reconnectez-vous pour partager une réaction.");
    return;
  }

  app.cursorChannel.send({
    type: "broadcast",
    event: "reaction",
    payload: { userId: app.userId, emoji },
  });
}

async function sendChatMessage(event) {
  event.preventDefault();
  const message = elements.chatInput.value.trim();
  if (!message || !app.client || !app.connected) {
    showToast("Connectez-vous à Supabase pour publier un message.");
    return;
  }

  const { error } = await app.client.from("chat_messages").insert([
    {
      username: app.username,
      message,
      color: app.color,
    },
  ]);

  if (error) {
    console.error(error);
    showToast("Le message n’a pas pu être envoyé.");
    return;
  }

  elements.chatInput.value = "";
}

function wireEvents() {
  elements.connectBtn.addEventListener("click", () => {
    setUserIdentity();
    connectToSupabase();
  });

  elements.randomNameBtn.addEventListener("click", () => {
    elements.usernameInput.value = randomName();
  });

  elements.surfaceArea.addEventListener("mousemove", handlePointerMove);

  elements.emojiButtons.forEach((btn) => {
    btn.addEventListener("click", () => sendReaction(btn.dataset.emoji));
  });

  elements.chatForm.addEventListener("submit", sendChatMessage);
  elements.chatInput.addEventListener("input", () => {
    if (!app.presenceChannel || !app.connected) return;
    app.presenceChannel.track({
      username: app.username,
      color: app.color,
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      typing: true,
    });

    clearTimeout(elements.chatInput.typingTimer);
    elements.chatInput.typingTimer = setTimeout(() => {
      app.presenceChannel.track({
        username: app.username,
        color: app.color,
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        typing: false,
      });
    }, 1200);
  });

  elements.themeToggle.addEventListener("click", () => {
    const nextMode = document.body.classList.contains("light") ? "dark" : "light";
    localStorage.setItem("theme-mode", nextMode);
    updateTheme();
  });

  window.addEventListener("beforeunload", () => {
    if (app.presenceChannel) {
      app.presenceChannel.untrack();
      app.presenceChannel.unsubscribe();
    }
    if (app.cursorChannel) {
      app.cursorChannel.unsubscribe();
    }
    if (app.chatChannel) {
      app.chatChannel.unsubscribe();
    }
  });
}

function bootstrap() {
  const savedUsername = localStorage.getItem("realtime-username");
  const savedColor = localStorage.getItem("realtime-color");
  const savedTheme = localStorage.getItem("theme-mode");

  if (savedTheme === "light") {
    document.body.classList.add("light");
  }

  elements.usernameInput.value = savedUsername || randomName();
  elements.colorInput.value = savedColor && savedColor.startsWith("#") ? savedColor : "#7c3aed";
  updateTheme();
  wireEvents();
  setUserIdentity();
  connectToSupabase();
}

bootstrap();

