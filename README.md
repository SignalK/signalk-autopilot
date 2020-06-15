# signalk-autopilot

<p align="center"><img src="./small-GUI-remote.png"></p>

`signalk-autopilot` is composed of 2 modules:
- [A graphical interface that emulates a Raymarine remote control](./GUI-help.md "GUI help")  
To be able to acknowledge pilot related alarms through the GUI you need to install the `signalk-alarm-silencer` plugin.  
- A back-end API described below.

This current only supports Raymarine NMEA 2000 and Raymarine Seatalk 1 Autopilots, but I'll be adding support for other autopilots as needed.

For Seatalk 1 Autopilots to work, a device that can translate Seatalk datagrams back and forth within an NMEA0183 sentence is required. They may be purchased from [Digital Yacht](https://digitalyachtamerica.com/product/st-nmea-usb/)) or [gadgetpool](http://www.gadgetpool.eu/nuke/modules.php?name=News&file=article&sid=28). There is also the [DIY](https://pysselilivet.blogspot.com/2020/06/seatalk1-to-nmea-0183-converter-diy.html) route. Also, signalk-to-nmea0183 plugin with APB (for route control) and MWV (for wind steer) should be enabled. For an example guide, see [TinyNMEA-USB.md](TinyNMEA-USB.md)

# API

All messages to plugin are done using PUT requests. These can be done via HTTP or over WebSockets.

Detailed info on [PUT](https://signalk.org/specification/1.3.0/doc/put.html) and [Request/Response](https://signalk.org/specification/1.3.0/doc/request_response.html)

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
  "requestId": "184743-434373-348483",
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

## Tack to port or starboard

The `value` is `port` or `starboard`.

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
