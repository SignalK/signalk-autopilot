/*
 * Copyright 2019 Christian MOTELET <cmotelet@motelet.com>
 *
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

const commands = {
  "auto":    {"path":"steering.autopilot.state","value":"auto"},
  "wind":    {"path":"steering.autopilot.state","value":"wind"},
  "route":   {"path":"steering.autopilot.state","value":"route"},
  "standby": {"path":"steering.autopilot.state","value":"standby"},
  "+1":      {"path":"steering.autopilot.actions.adjustHeading","value":1},
  "+10":     {"path":"steering.autopilot.actions.adjustHeading","value":10},
  "-1":      {"path":"steering.autopilot.actions.adjustHeading","value":-1},
  "-10":     {"path":"steering.autopilot.actions.adjustHeading","value":-10},
  "tackToPort":   {"path":"steering.autopilot.actions.tack","value":"port"},
  "tackToStarboard":   {"path":"steering.autopilot.actions.tack","value":"starboard"},
  "advanceWaypoint":   {"path":"steering.autopilot.actions.advanceWaypoint","value":"1"}
}

var notificationsArray = {};

var touchEnd = function(event) {
  event.currentTarget.onclick();
  event.preventDefault(true);
}

var ws = null;
var handlePilotStatusTimeout = null;
var handleReceiveTimeout = null;
var handleSilenceScreenTimeout = null;
var handleConfirmActionTimeout = null;
var handleCountDownCounterTimeout = null;
var connected = false;
var reconnect = true;
const timeoutReconnect = 2000;
const timeoutValue = 3000;
const timeoutBlink = 500;
const countDownDefault = 5;
const noDataMessage = '-- -- -- --';
var pilotStatusDiv = undefined;
var headingValueDiv = undefined;
var receiveIconDiv = undefined;
var sendIconDiv = undefined;
var typeValIconDiv = undefined;
var errorIconDiv = undefined;
var countDownCounterDiv = undefined;
var powerOnIconDiv = undefined;
var powerOffIconDiv = undefined;
var bottomBarIconDiv = undefined;
var notificationCounterDiv = undefined;
var notificationCounterTextDiv = undefined;
var silenceScreenDiv = undefined;
var silenceScreenText = undefined;
var confirmScreenDiv = undefined;
var skPathToAck = '';
var actionToBeConfirmed = '';
var countDownValue = 0;
var pilotStatus = '';

var displayByPathParams = {
  'navigation.headingMagnetic': {
    handleTimeout: null,
    typeVal: 'Mag',
    usage: ['wind', 'route', 'auto', 'standby'],
    value: ''
  },
  'navigation.headingTrue': {
    handleTimeout: null,
    typeVal: 'True',
    usage: ['wind', 'route', 'auto', 'standby'],
    value: ''
  },
  'environment.wind.angleApparent': {
    handleTimeout: null,
    typeVal: 'AWA',
    usage: ['wind'],
    value: ''
  },
  'environment.wind.angleTrueWater': {
    handleTimeout: null,
    typeVal: 'TWA',
    usage: ['wind'],
    value: ''
  }
}

var preferedDisplayMode = {
  wind: 'environment.wind.angleApparent',
  route: 'navigation.headingMagnetic',
  auto: 'navigation.headingMagnetic',
  standby: 'navigation.headingMagnetic'
}

var startUpAutoPilot = function() {
  pilotStatusDiv = document.getElementById('pilotStatus');
  headingValueDiv = document.getElementById('headingValue');
  receiveIconDiv = document.getElementById('receiveIcon');
  sendIconDiv = document.getElementById('sendIcon');
  typeValIconDiv = document.getElementById('typeValIcon');
  errorIconDiv = document.getElementById('errorIcon');
  powerOnIconDiv = document.getElementById('powerOnIcon');
  powerOffIconDiv = document.getElementById('powerOffIcon');
  bottomBarIconDiv = document.getElementById('bottomBarIcon');
  notificationCounterDiv = document.getElementById('notificationCounter');
  notificationCounterTextDiv = document.getElementById('notificationCounterText');
  silenceScreenDiv = document.getElementById('silenceScreen');
  silenceScreenTextDiv = document.getElementById('silenceScreenText');
  confirmScreenDiv = document.getElementById('confirmScreen');
  countDownCounterDiv = document.getElementById('countDownCounter');
  setPilotStatus('');
  setHeadindValue('');
  var savedPreferedDisplayModeJSON = localStorage.getItem('signalk-autopilot');
  var savedPreferedDisplayMode = savedPreferedDisplayModeJSON && JSON.parse(savedPreferedDisplayModeJSON);
  if (savedPreferedDisplayMode === null) {savedPreferedDisplayMode = {};}
  savedPreferedDisplayMode = (typeof savedPreferedDisplayMode.preferedDisplayMode !== 'undefined') ? savedPreferedDisplayMode.preferedDisplayMode : {};
  Object.keys(preferedDisplayMode).map( pilotMode => {
    var pathForPilotMode = savedPreferedDisplayMode[pilotMode];
    if ((typeof pathForPilotMode !== 'undefined') &&
        (typeof displayByPathParams[pathForPilotMode] !== 'undefined') &&
        displayByPathParams[pathForPilotMode].usage.includes(pilotMode)) {
      preferedDisplayMode[pilotMode] = pathForPilotMode;
    }
  })
//  demo(); return;
  setTimeout(() => {
    receiveIconDiv.style.visibility = 'hidden';
    sendIconDiv.style.visibility = 'hidden';
    errorIconDiv.style.visibility = 'hidden';
    bottomBarIconDiv.style.visibility = 'hidden';
    notificationCounterDiv.style.visibility = 'hidden';
    countDownCounterDiv.innerHTML = '';
    typeValIconDiv.innerHTML = '';
    wsConnect();
  }, 1500);
}

var demo = function () {
  var headingPath = 'environment.wind.angleTrueWater';
  setPilotStatus('wind');
  buildHeadindValue( headingPath, 1.74);
  clearTimeout(displayByPathParams[headingPath].handleTimeout);
  setNotificationMessage({"path":"notifications.autopilot.PilotWarningWindShift","value":{"state":"alarm","message":"Pilot Warning Wind Shift"}});
  powerOffIconDiv.style.visibility = 'hidden';
  powerOnIconDiv.style.visibility = 'visible';
  countDownCounterDiv.innerHTML = countDownDefault.toString();
}

var buildAndSendCommand = function(cmd) {
  var cmdAction = commands[cmd];
  if (typeof cmdAction === 'undefined') {
    alert('Unknown command !');
    return null;
  }
  if ((actionToBeConfirmed !== '')&&(actionToBeConfirmed !== cmd)) {
    clearConfirmCmd();
  }
  if (((cmd === 'tackToPort')||(cmd === 'tackToStarboard'))&&(actionToBeConfirmed === '')) {
    confirmTack(cmd);
    return null;
  }
  if ((cmd === 'route')&&(pilotStatus === 'route')&&(actionToBeConfirmed === '')) {
    confirmAdvanceWaypoint(cmd);
    return null;
  }
  if (actionToBeConfirmed === cmd) {
    clearConfirmCmd();
    if ((cmd === 'tackToPort')||(cmd === 'tackToStarboard')) {
      sendCommand(commands['auto']); // force mode 'auto' to take a tack
      sendCommand(cmdAction);
    }
    if ((cmd === 'route')&&(pilotStatus === 'route')) {
      sendCommand(commands['advanceWaypoint']);
    }
    return null;
  }
  sendCommand(cmdAction);
}

var sendCommand = function(cmdAction) {
  reconnect = true;
  wsConnect();
  if ((ws === null) || (ws.readyState !== 1)) {
    errorIconDiv.style.visibility = 'visible';
    alert('Not connected yet, please retry your command...');
    return null;
  }
  console.log(cmdAction);
  errorIconDiv.style.visibility = 'hidden';
  sendIconDiv.style.visibility = 'visible';
  var cmdActionValue = (typeof cmdAction.value === 'string') ? '"' + cmdAction.value + '"' : cmdAction.value;
  var cmdJson = '{"context": "vessels.self", "requestId": "184743-434373-348483", "put": { "path": ';
  cmdJson = cmdJson + '"' + cmdAction.path + '", "value": ' + cmdActionValue + ' }}';
  console.log(cmdJson);
  ws.send(cmdJson);
  setTimeout(() => {sendIconDiv.style.visibility = 'hidden';}, timeoutBlink);

/*
  window.fetch('/plugins/raymarineautopilot/command', {
    method: 'POST',
    headers: {
      "Content-Type": "application/json"
    },
    body: cmdJson,
  }).then(function(response) {
      setTimeout(() => {sendIconDiv.style.visibility = 'hidden';}, timeoutBlink);
      if (response.status !== 200) {
        errorIconDiv.style.visibility = 'visible';
        if (response.status === 401) {
          alert('You must be authenticated to send commands !')
        } else {
          errorIconDiv.style.visibility = 'visible';
          alert('[' + response.status + ']' + response.text)
        }
      }
    }, function(status) {
        sendIconDiv.style.visibility = 'hidden';
        errorIconDiv.style.visibility = 'visible';
        alert(status.message)
    }
  );
*/
}

var silenceAlarm = function(skPathToAck) {
  window.fetch('/silenceNotification', {
    method: 'POST',
    headers: {
      "Content-Type": "application/json"
    },
    body: {path: skPathToAck},
  }).then(function(response) {
      setTimeout(() => {sendIconDiv.style.visibility = 'hidden';}, timeoutBlink);
      if (response.status !== 200) {
        errorIconDiv.style.visibility = 'visible';
        if (response.status === 401) {
          alert('You must be authenticated to send commands !')
        } else {
          errorIconDiv.style.visibility = 'visible';
          alert('[' + response.status + ']' + response.text)
        }
      }
    }, function(status) {
        sendIconDiv.style.visibility = 'hidden';
        errorIconDiv.style.visibility = 'visible';
        alert(status.message)
    }
  );
}

var notificationToValue = function (skPathToAck) {
  var message = notificationsArray[skPathToAck];
  if (typeof message === 'undefined') {
    message = 'No current alarm...';
  }
  return message;
}

var sendSilence = function() {
  if (silenceScreenDiv.style.visibility !== 'visible') {
    silenceScreenDiv.style.visibility = 'visible';
    autoHideSilenceScreen();
    if ((Object.keys(notificationsArray).length > 0) && (skPathToAck === '')) {
      skPathToAck = Object.keys(notificationsArray)[0];
    }
  } else {
      if (skPathToAck !== '') {
        silenceAlarm(skPathToAck);
      }
      countDownValue = 0;
      updateCountDownCounter();
      silenceScreenDiv.style.visibility = 'hidden';
    }
  silenceScreenTextDiv.innerHTML = notificationToValue(skPathToAck);
}

var notificationScroll = function() {
  autoHideSilenceScreen();
  if (silenceScreenDiv.style.visibility !== 'visible') {
    silenceScreenDiv.style.visibility = 'visible';
    if ((Object.keys(notificationsArray).length > 0) && (skPathToAck === '')) {
      skPathToAck = Object.keys(notificationsArray)[0];
    }
  } else {
      skPathToAck = getNextNotification(skPathToAck);
    }
  silenceScreenTextDiv.innerHTML = notificationToValue(skPathToAck);
}

var autoHideSilenceScreen = function() {
  countDownValue = countDownDefault;
  updateCountDownCounter();
  clearTimeout(handleSilenceScreenTimeout);
  handleSilenceScreenTimeout = setTimeout(() => {
    silenceScreenDiv.style.visibility = 'hidden';
    countDownValue = 0;
    updateCountDownCounter();
  }, 5000);
}

var getNextNotification = function(skPath) {
  var notificationsKeys = Object.keys(notificationsArray);
  var newSkPathToAck = '';
  var index;
  if (notificationsKeys.length > 0) {
    if (typeof skPath !== 'undefined') {
      index = notificationsKeys.indexOf(skPath) + 1;
    } else {
        index = 0;
      }
    if (notificationsKeys.length <= index) {
      index = 0;
    }
    newSkPathToAck = notificationsKeys[index];
  }
  return newSkPathToAck;
}

var changePreferedDisplayMode = function() {
  const currentPilotStatus = pilotStatus;
  const currentPreferedDisplayMode = preferedDisplayMode[currentPilotStatus];
  var pathForPilotStatus = [];
  if (typeof currentPreferedDisplayMode === 'undefined') {return null}
  for (let [key, value] of Object.entries(displayByPathParams)) {
   if ((typeof value.usage === 'object') && value.usage.includes(currentPilotStatus)) {
     pathForPilotStatus.push(key);
   }
  }
  const currentIndex = pathForPilotStatus.indexOf(currentPreferedDisplayMode);
  const nextIndex = (currentIndex + 1) % pathForPilotStatus.length;
  preferedDisplayMode[currentPilotStatus] = pathForPilotStatus[nextIndex];
  localStorage.setItem('signalk-autopilot', JSON.stringify({preferedDisplayMode: preferedDisplayMode}));
  setHeadindValue(displayByPathParams[preferedDisplayMode[currentPilotStatus]].value);
  typeValIconDiv.innerHTML = displayByPathParams[preferedDisplayMode[currentPilotStatus]].typeVal;
}

var confirmTack = function(cmd) {
  var message = 'Repeat same key<br>to confirm<br>tack to ';
  if (cmd === 'tackToPort') {
    message += 'port';
    actionToBeConfirmed = cmd;
  } else if (cmd === 'tackToStarboard') {
      message += 'starboard';
      actionToBeConfirmed = cmd;
    } else {
        actionToBeConfirmed = '';
        return null;
      }
  startConfirmCmd(cmd, message);
}

var confirmAdvanceWaypoint = function(cmd) {
  var message = 'Repeat key TRACK<br>to confirm<br>Advance Waypoint';
  startConfirmCmd(cmd, message);
}

var startConfirmCmd = function (cmd, message) {
  countDownValue = countDownDefault;
  actionToBeConfirmed = cmd;
  updateCountDownCounter();
  confirmScreenDiv.innerHTML = '<p>' + message + '</p>';
  confirmScreenDiv.style.visibility = 'visible';
  clearTimeout(handleConfirmActionTimeout);
  handleConfirmActionTimeout = setTimeout(() => {
    confirmScreenDiv.style.visibility = 'hidden';
    confirmScreenDiv.innerHTML = '';
    actionToBeConfirmed = '';
  }, 5000);
}

var clearConfirmCmd = function () {
  clearTimeout(handleConfirmActionTimeout);
  clearTimeout(handleCountDownCounterTimeout);
  countDownValue = -1;
  countDownCounterDiv.innerHTML = '';
  confirmScreenDiv.style.visibility = 'hidden';
  confirmScreenDiv.innerHTML = '';
  actionToBeConfirmed = '';
  cmdConfirmed = false;
}

var wsConnect = function() {
  if (ws === null) {
    try {
      reconnect = true;
      ws = new WebSocket((window.location.protocol === 'https:' ? 'wss' : 'ws') + "://" + window.location.host + "/signalk/v1/stream?subscribe=none");

      ws.onopen = function() {
        connected = true;
        powerOffIconDiv.style.visibility = 'hidden';
        powerOnIconDiv.style.visibility = 'visible';
        errorIconDiv.style.visibility = 'hidden';
        var subscriptionObject = {
          "context": "vessels.self",
          "subscribe": [
            {
              "path": "steering.autopilot.state",
              "format": "delta",
              "minPeriod": 900
            },
            {
              "path": "navigation.headingMagnetic",
              "format": "delta",
              "minPeriod": 900
            },
            {
              "path": "navigation.headingTrue",
              "format": "delta",
              "minPeriod": 900
            },
            {
              "path": "environment.wind.angleApparent",
              "format": "delta",
              "minPeriod": 900
            },
            {
              "path": "environment.wind.angleTrueWater",
              "format": "delta",
              "minPeriod": 900
            },
            {
              "path": "notifications.autopilot.*",
              "format": "delta",
              "minPeriod": 200
            }
          ]
        };
        var subscriptionMessage = JSON.stringify(subscriptionObject);
        ws.send(subscriptionMessage);
      }

      ws.onclose = function() {
        cleanOnClosed();
        if (reconnect === true) {
          setTimeout(() => {wsConnect()}, timeoutReconnect);
        }
      }

      ws.onerror = function() {
        console.log("ws error");
        cleanOnClosed();
        errorIconDiv.style.visibility = 'visible';
        if (reconnect === true) {
          setTimeout(() => {wsConnect()}, timeoutReconnect);
        }
      }

      ws.onmessage = function(event) {
        receiveIconDiv.style.visibility = 'visible';
        clearTimeout(handleReceiveTimeout);
        handleReceiveTimeout = setTimeout(() => {receiveIconDiv.style.visibility = 'hidden';}, timeoutBlink);
        var jsonData = JSON.parse(event.data)
        if (typeof jsonData.requestId !== 'undefined') {
          if (jsonData.state === 'COMPLETED') {
            if (jsonData.statusCode !== 200) {
              errorIconDiv.style.visibility = 'visible';
              alert('[' + jsonData.statusCode + ']' + jsonData.message);
            }
          }
          console.log(jsonData);
        }
        dispatchMessages(jsonData);
      }

    } catch (exception) {
      console.error(exception);
      cleanOnClosed();
      errorIconDiv.style.visibility = 'visible';
      setTimeout(() => {wsConnect()}, timeoutReconnect);
    }
  }
}

var dispatchMessages = function(jsonData) {
  if (typeof jsonData.updates === 'object') {
    jsonData.updates.forEach((update) => {
      if (typeof update.values === 'object') {
        update.values.forEach((value) => {
          if (value.path === "steering.autopilot.state") {
            clearTimeout(handlePilotStatusTimeout);
            handlePilotStatusTimeout = setTimeout(() => {
              console.log('timeout:'+pilotStatus);
              setPilotStatus('');
            }, timeoutValue);
            setPilotStatus(value.value);
          } else if (value.path.startsWith("notifications.autopilot")) {
            setNotificationMessage(value);
          } else {
            buildHeadindValue(value.path, value.value);
          }
        });
      }
    });
  }
}

var buildHeadindValue = function(path, value) {
  var displayByPathParam = displayByPathParams[path];

  if (typeof displayByPathParam === 'undefined') {
    console.log('unknown path:' + path);
    return null;
  }

  value = Math.round(value * (180/Math.PI));
  displayByPathParam.value = ((typeof value === 'undefined') || isNaN(value)) ? noDataMessage : ' ' + value + '&deg;';
  clearTimeout(displayByPathParam.handleTimeout);
  displayByPathParam.handleTimeout = setTimeout(() => {
    displayByPathParams[path].value = noDataMessage;
    console.log('timeout:{'+pilotStatus+'}['+path+']'+displayByPathParams[path].value);
    if (preferedDisplayMode[pilotStatus] == path) {
      setHeadindValue(displayByPathParams[path].value);
    }
  }, timeoutValue, path);
  if (preferedDisplayMode[pilotStatus] == path) {
    if (typeValIconDiv.innerHTML !== displayByPathParam.typeVal) {
      typeValIconDiv.innerHTML = displayByPathParam.typeVal;
    }
    setHeadindValue(displayByPathParams[path].value);
  }
}

var setHeadindValue = function(value) {
  if (pilotStatus === '') { value = ''}
  headingValueDiv.innerHTML = ((typeof value === 'undefined') || (value === '')) ? noDataMessage : value;
}

var setPilotStatus = function(value) {
  if (typeof value === 'undefined') {
    value = '';
  }
  pilotStatus = value;
  if (value === '') {
    setHeadindValue(noDataMessage);
    pilotStatusDiv.innerHTML = noDataMessage;
  } else { pilotStatusDiv.innerHTML = value;}
}

var setNotificationMessage = function(value) {
  if (typeof value.path !== 'undefined') {
    value.path = value.path.replace('notifications.', '');
    if (typeof value.value !== 'undefined') {
      if (value.value.state === 'normal') {
        if (bottomBarIconDiv.innerHTML === notificationsArray[value.path]) {
          bottomBarIconDiv.innerHTML = '';
        }
        delete notificationsArray[value.path]
      } else {
          notificationsArray[value.path] = value.value.message.replace('Pilot', '');
          bottomBarIconDiv.style.visibility = 'visible';
          bottomBarIconDiv.innerHTML = notificationsArray[value.path];
        }
    }
  }
  var alarmsCount = Object.keys(notificationsArray).length;
  if (alarmsCount > 0) {
    notificationCounterTextDiv.innerHTML = alarmsCount;
    notificationCounterDiv.style.visibility = 'visible';
    if (bottomBarIconDiv.innerHTML === '') {
      bottomBarIconDiv.innerHTML = Object.keys(notificationsArray)[0];
    }
  } else {
      notificationCounterTextDiv.innerHTML = '';
      notificationCounterDiv.style.visibility = 'hidden';
      bottomBarIconDiv.style.visibility = 'hidden';
      bottomBarIconDiv.innerHTML = '';
    }
}

var displayHelp = function() {
  bottomBarIconDiv.style.visibility = 'visible';
  bottomBarIconDiv.innerHTML = '&nbsp;Not yet implemented...'
  setTimeout(() => {bottomBarIconDiv.style.visibility = 'hidden';}, 2000);
}

var wsOpenClose = function() {
  if (connected === false) {
    wsConnect();
  } else {
      reconnect = false;
      if (ws !== null) {
        ws.close();
      }
      cleanOnClosed();
    }
}

var cleanOnClosed = function() {
  ws = null;
  connected = false;
  receiveIconDiv.style.visibility = 'hidden';
  sendIconDiv.style.visibility = 'hidden';
  errorIconDiv.style.visibility = 'hidden';
  bottomBarIconDiv.style.visibility = 'hidden';
  notificationCounterDiv.style.visibility = 'hidden';
  powerOffIconDiv.style.visibility = 'visible';
  powerOnIconDiv.style.visibility = 'hidden';
  notificationCounterDiv.style.visibility = 'hidden';
  silenceScreenDiv.style.visibility = 'hidden';
  notificationCounterTextDiv.innerHTML = '';
  typeValIconDiv.innerHTML = '';
  notificationsArray = {};
  skPathToAck = '';
  actionToBeConfirmed = '';
  pilotStatus = '';
  Object.keys(displayByPathParams).map( path => {
    clearTimeout(displayByPathParams[path].handleTimeout);
    displayByPathParams[path].value = '';
  });
  clearTimeout(handlePilotStatusTimeout);
  setPilotStatus('');
  setHeadindValue('');
}

var updateCountDownCounter = function() {
  if (countDownValue > 0) {
    clearTimeout(handleCountDownCounterTimeout);
    countDownCounterDiv.innerHTML = countDownValue;
    countDownValue -= 1;
    handleCountDownCounterTimeout = setTimeout(() => {
      updateCountDownCounter();
    }, 1000);
  } else {
      clearTimeout(handleCountDownCounterTimeout);
      countDownCounterDiv.innerHTML = '';
    }
}
