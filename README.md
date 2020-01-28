# signalk-autopilot

[![Greenkeeper badge](https://badges.greenkeeper.io/sbender9/signalk-autopilot.svg)](https://greenkeeper.io/)

<p align="center"><img src="./small-rayremote.png"></p>

`signalk-autopilot` is composed of 2 modules: 
- [A graphical interface that emulates a Raymarine remote control](./GUI-help.md "GUI help")
- A back-end API described below.

This current only supports Raymarine NMEA 2000 Autopilots, but I'll be adding support for other autopilots as needed.

# API

All messages to plugin are done using PUT requests. These can be done via HTTP or over WebSockets.

Http:

```
PUT http://localhost:3000/signalk/v1/api/vessels/self/steering/autopilot/target/headingMagnetic
{
  "value": 1.52,
}
```

Delta:

```
{
  "context": "vessels.self",
  "correlationId": "184743-434373-348483",
  "put": {
    "path": "steering.autopilot.target.headingMagnetic",
    "value": 1.52
  }
}
```


## Advance Waypoint
```
PUT http://localhost:3000/signalk/v1/api/vessels/self/steering/autopilot/actions/advanceWaypoint
{
  "value": 1,
}
```

## Set Autopilot State

The `value` can be `auto`, `wind`, `route`, or `standby`

```
PUT http://localhost:3000/signalk/v1/api/vessels/self/steering/autopilot/state
{
  "value": "auto",
}
```

## Change Target Heading or Wind Angle

The `value` is in degrees and is the amount to change. So when in `auto` at a heading of 180, a value of `-10` will change the target heading would be changed to `170`

```
PUT http://localhost:3000/signalk/v1/api/vessels/self/steering/autopilot/actions/adjustHeading
{
  "value": -10,
}
```

## Take a tack to port or starboard

The `value` is `port` or `starboard`. 
This command must be send only when your pilot is in `auto` or `wind` mode.

```
PUT http://localhost:3000/signalk/v1/api/vessels/self/steering/autopilot/actions/tack
{
  "value": "port",
}
```

## Target Heading

The `value` is the heading in radians.

```
PUT http://localhost:3000/signalk/v1/api/vessels/self/steering/autopilot/target/headingMagnetic
{
  "value": 1.52,
}
```

## Target Wind Angle

The `value` is the wind angle in radians.

```
PUT http://localhost:3000/signalk/v1/api/vessels/self/steering/autopilot/target/windAngleApparent
{
  "value": 1.52,
}
```


