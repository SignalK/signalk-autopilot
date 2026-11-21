/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// The keypad design: a mode display above keys laid out like a pilot keypad.
// It reads the same paths and sends the same PUTs as the classic remote.

const VALUE_TIMEOUT = 5000;
const RECONNECT_DELAY = 2000;
const MAX_RUDDER_DRAWN = 35;

const PATHS = [
  'steering.autopilot.state',
  'steering.autopilot.target.headingTrue',
  'steering.autopilot.target.headingMagnetic',
  'steering.autopilot.target.windAngleApparent',
  'navigation.headingTrue',
  'navigation.headingMagnetic',
  'environment.wind.angleApparent',
  'steering.rudderAngle'
];

// How each pilot state is named on the display and in the mode menu.
const MODES = {
  standby: { letter: 'S', name: 'Standby' },
  auto: { letter: 'A', name: 'Heading hold' },
  noDrift: { letter: 'ND', name: 'No Drift' },
  wind: { letter: 'W', name: 'Wind' },
  route: { letter: 'N', name: 'Nav' }
};
const DEFAULT_STATES = ['auto', 'wind', 'route'];

// What an older n2k-signalk writes for a heading hold.
const LEGACY_STATES = { heading: 'auto' };

const values = {};
const alarms = {};
let states = DEFAULT_STATES.slice();
// The Autopilot API publishes the state as the pilot provider names it, with
// the device as source; the pilot's own NMEA 2000 state may be named
// differently, so only the API's is used when there is one.
let pilotSource = null;
let ws = null;
let requestCounter = 0;
let infoTimeout = null;
const el = {};

function current(path) {
  const v = values[path];
  if (!v || Date.now() - v.time > VALUE_TIMEOUT) {
    return undefined;
  }
  return v.value;
}

function degrees(radians) {
  return (radians * 180) / Math.PI;
}

function headingText(radians) {
  const d = ((Math.round(degrees(radians)) % 360) + 360) % 360;
  return String(d).padStart(3, '0');
}

// A heading as true, or as magnetic when there is no true one.
function trueOrMagnetic(truePath, magneticPath) {
  const t = current(truePath);
  if (typeof t === 'number') {
    return { value: t, unit: '°T' };
  }
  const m = current(magneticPath);
  if (typeof m === 'number') {
    return { value: m, unit: '°M' };
  }
  return undefined;
}

function valueBlock(label, number, unit, side, small) {
  const block = document.createElement('div');
  block.className = 'val' + (small ? ' small' : '');
  const labelDiv = document.createElement('div');
  labelDiv.className = 'label';
  labelDiv.textContent = label;
  const num = document.createElement('div');
  num.className = 'num';
  if (side !== undefined) {
    const tri = document.createElement('span');
    tri.className = 'tri ' + side;
    if (side) {
      tri.setAttribute('role', 'img');
      tri.setAttribute('aria-label', side === 'port' ? 'port' : 'starboard');
    }
    num.appendChild(tri);
  }
  const n = document.createElement('span');
  n.textContent = number;
  const u = document.createElement('span');
  u.className = 'unit';
  u.textContent = unit;
  num.append(n, u);
  block.append(labelDiv, num);
  return block;
}

function headingBlock(label, heading) {
  return heading
    ? valueBlock(label, headingText(heading.value), heading.unit)
    : valueBlock(label, '---', '°');
}

function windBlock(label, radians, small) {
  if (typeof radians !== 'number') {
    return valueBlock(label, '--', '°', '', small);
  }
  // Some sources write a wind angle from port as 180..360 degrees.
  let d = Math.round(degrees(radians));
  if (d > 180) {
    d -= 360;
  }
  const side = d < 0 ? 'port' : d > 0 ? 'stbd' : '';
  return valueBlock(label, String(Math.abs(d)), '°', side, small);
}

function renderValues(state) {
  const blocks = [];
  if (state === 'wind') {
    blocks.push(windBlock('Apparent wind angle', current('environment.wind.angleApparent'), true));
    blocks.push(windBlock('Target wind angle', current('steering.autopilot.target.windAngleApparent')));
  } else if (state === 'standby' || state === undefined) {
    blocks.push(headingBlock('Heading', trueOrMagnetic('navigation.headingTrue', 'navigation.headingMagnetic')));
  } else {
    const label = state === 'noDrift' ? 'Target bearing' : 'Target heading';
    blocks.push(headingBlock(label, trueOrMagnetic(
      'steering.autopilot.target.headingTrue', 'steering.autopilot.target.headingMagnetic')));
  }
  el.values.replaceChildren(...blocks);
}

// The rudder as seen from above, bow up: the blade hangs from its stock and
// swings to starboard (right) for a positive angle.
function renderRudder() {
  const rudder = current('steering.rudderAngle');
  if (typeof rudder !== 'number') {
    el.rudder.replaceChildren();
    return;
  }
  const d = degrees(rudder);
  const drawn = Math.max(-MAX_RUDDER_DRAWN, Math.min(MAX_RUDDER_DRAWN, d)) * 1.6;
  el.rudder.innerHTML =
    '<svg viewBox="0 0 240 96" role="img" aria-label="Rudder ' + Math.round(d) + ' degrees">' +
    '<path d="M30 40 Q120 100 210 40" fill="none" stroke="#c8d0d6" stroke-width="10"/>' +
    '<path d="M30 47 Q120 107 210 47" fill="none" stroke="#9acd32" stroke-width="2"/>' +
    '<g transform="rotate(' + (-drawn).toFixed(1) + ' 120 6)">' +
    '<line x1="120" y1="6" x2="120" y2="66" stroke="#fff" stroke-width="4" stroke-linecap="round"/></g>' +
    '<rect x="102" y="58" width="36" height="26" rx="4" fill="#f2f4f5"/>' +
    '<text x="120" y="77" text-anchor="middle" font-size="17" font-weight="700" fill="#111">' +
    Math.abs(Math.round(d)) + '</text></svg>';
}

function renderModebar(state) {
  const mode = MODES[state];
  el.modebar.className = 'modebar' + (state === undefined ? ' offline' : state === 'standby' ? ' standby' : '');
  el.modeLetter.textContent = state === undefined ? '' : mode ? mode.letter : state.charAt(0).toUpperCase();
  el.modeName.textContent = state === undefined ? 'No pilot' : mode ? mode.name : state;
  el.keyAuto.classList.toggle('on', state === 'auto');
  el.keyWind.classList.toggle('on', state === 'wind');
}

// The menu is rebuilt only when the pilot's states change, so that a focused
// button survives the updates; the current state is marked in place.
let menuStates = '';

function renderMenu(state) {
  const key = states.join(',');
  if (key === menuStates) {
    Array.from(el.menuItems.children).forEach((b) => {
      b.classList.toggle('on', b.dataset.cmd === 'state:' + state);
    });
    return;
  }
  menuStates = key;
  const items = states.filter((s) => s !== 'standby').map((s) => {
    const mode = MODES[s] || { letter: s.charAt(0).toUpperCase(), name: s };
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'item' + (s === state ? ' on' : '');
    b.dataset.cmd = 'state:' + s;
    const letter = document.createElement('span');
    letter.className = 'letter';
    letter.textContent = mode.letter;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = mode.name;
    b.append(letter, name);
    return b;
  });
  el.menuItems.replaceChildren(...items);
}

function renderAlarm() {
  const paths = Object.keys(alarms);
  el.alarm.classList.toggle('on', paths.length > 0);
  if (paths.length > 0) {
    const last = paths[paths.length - 1];
    el.alarmText.textContent = alarms[last] + (paths.length > 1 ? ' (+' + (paths.length - 1) + ')' : '');
    el.alarm.dataset.path = last;
  }
}

function render() {
  // A state the provider does not list comes as null: no pilot to show.
  const state = current('steering.autopilot.state') || undefined;
  renderModebar(state);
  renderValues(state);
  renderRudder();
  if (el.menu.classList.contains('open')) {
    renderMenu(state);
  }
  renderAlarm();
}

function showInfo(text) {
  el.info.textContent = text;
  el.info.classList.add('on');
  clearTimeout(infoTimeout);
  infoTimeout = setTimeout(() => el.info.classList.remove('on'), 4000);
}

function put(path, value) {
  if (ws === null || ws.readyState !== WebSocket.OPEN) {
    showInfo('Not connected, please try again');
    connect();
    return;
  }
  requestCounter += 1;
  ws.send(JSON.stringify({
    context: 'vessels.self',
    requestId: 'keypad-' + Date.now() + '-' + requestCounter,
    put: { path, value }
  }));
}

function command(cmd) {
  if (cmd === 'menu') {
    renderMenu(current('steering.autopilot.state') || undefined);
    el.menu.classList.add('open');
    return;
  }
  el.menu.classList.remove('open');
  if (cmd === 'closeMenu') {
    return;
  }
  if (cmd.startsWith('state:')) {
    put('steering.autopilot.state', cmd.substring(6));
  } else if (cmd === 'standby' || cmd === 'auto' || cmd === 'wind') {
    put('steering.autopilot.state', cmd);
  } else {
    // +1 turns the boat to starboard in every mode; the pilot provider
    // knows what that means for a wind angle.
    put('steering.autopilot.actions.adjustHeading', Number(cmd));
  }
}

function silence() {
  const path = el.alarm.dataset.path;
  if (path) {
    put('notifications.' + path + '.state', 'normal');
  }
}

function handleMessage(msg) {
  if (msg.requestId !== undefined) {
    const failed = msg.state === 'FAILED' || (msg.state === 'COMPLETED' && msg.statusCode !== 200);
    if (failed) {
      showInfo(msg.statusCode === 401 || msg.statusCode === 403
        ? 'Log in to Signal K to steer'
        : (msg.message || 'Command failed') + (msg.statusCode ? ' [' + msg.statusCode + ']' : ''));
    }
    return;
  }
  if (!Array.isArray(msg.updates)) {
    return;
  }
  msg.updates.forEach((update) => {
    (update.values || []).forEach((pv) => {
      if (pv.path.startsWith('notifications.autopilot')) {
        const path = pv.path.substring('notifications.'.length);
        if (pv.value && pv.value.state && pv.value.state !== 'normal') {
          alarms[path] = String(pv.value.message || path).replace('Pilot ', '');
        } else {
          delete alarms[path];
        }
      } else if (pv.path === 'steering.autopilot.state') {
        if (pilotSource === null) {
          values[pv.path] = { value: LEGACY_STATES[pv.value] || pv.value, time: Date.now() };
        } else if (update.$source === pilotSource) {
          values[pv.path] = { value: pv.value, time: Date.now() };
        }
      } else {
        values[pv.path] = { value: pv.value, time: Date.now() };
      }
    });
  });
  render();
}

function connect() {
  if (ws !== null) {
    return;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(protocol + '://' + window.location.host + '/signalk/v1/stream?subscribe=none');
  ws.onopen = () => {
    // minPeriod throttles a path, not a source: the pilot's own state would
    // crowd out the Autopilot API's, which is the one shown.
    const subscribe = PATHS.map((path) => ({
      path,
      format: 'delta',
      minPeriod: path === 'steering.autopilot.state' ? 0 : 500
    }));
    subscribe.push({ path: 'notifications.autopilot.*', format: 'delta', minPeriod: 200 });
    ws.send(JSON.stringify({ context: 'vessels.self', subscribe }));
  };
  ws.onmessage = (event) => handleMessage(JSON.parse(event.data));
  ws.onclose = () => {
    ws = null;
    setTimeout(connect, RECONNECT_DELAY);
  };
  ws.onerror = () => ws && ws.close();
}

// The default pilot and the states it offers, from the Autopilot API when it
// is there.
function loadPilot() {
  fetch('/signalk/v2/api/vessels/self/autopilots', { credentials: 'include' })
    .then((res) => (res.ok ? res.json() : undefined))
    .then((pilots) => {
      const id = pilots && Object.keys(pilots).find((key) => pilots[key].isDefault);
      if (id) {
        pilotSource = id;
      }
    })
    .catch(() => { });
  fetch('/signalk/v2/api/vessels/self/autopilots/_default', { credentials: 'include' })
    .then((res) => (res.ok ? res.json() : undefined))
    .then((info) => {
      const list = info && info.options && info.options.states;
      if (Array.isArray(list) && list.length > 0) {
        states = list.map((s) => s.name);
        render();
      }
    })
    .catch(() => { });
}

export function start() {
  ['modebar', 'modeLetter', 'modeName', 'alarm', 'alarmText', 'info', 'values', 'rudder',
    'menu', 'menuItems', 'keyAuto', 'keyWind'].forEach((id) => {
    el[id] = document.getElementById(id);
  });
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cmd]');
    if (button) {
      command(button.dataset.cmd);
    }
  });
  el.alarm.addEventListener('click', silence);
  render();
  setInterval(render, 1000);
  loadPilot();
  connect();
}

document.addEventListener('DOMContentLoaded', start);
