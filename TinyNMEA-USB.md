<b>How to use WilhelmSK-SignalK-TinyNMEAUSB “tiny” in Raymarine Seatalk1 “ST1” Networks for remote autopilot control?</b><br>
<i>By Sancan</i>
1.   You will need
⁃     SignalK server ( tested with RPi 3B, SignalK server 1.30) with two plugins (SignalK-NMEA0183 and Autopilot) installed and activated
⁃     TinyNMEA-USB converter
⁃      ST1 AutoPilot Controller ( tested with RC435 Chart plotter, ST60 Wind , ST60 Tridata, ST6002AP and S2 SmartPilot ST1 network)
⁃     WilhemSK ( tested with and iPad based WilhemSK)
2.   Configuration
⁃     I had SignalK has been set up via open plotter NOOBs with default settings ( you will find detailed installation instructions in below link)
⁃     Tiny converter
⁃     Tiny comes with a comprehensive document set with user manual, follow the user manual to configure for correct serial port communication parameters (4800bps/8N1 etc.) (mine arrived with correct setup, thus no need to change anything for communication but better to be sure about it). You will need a terminal program for accessing tiny (such as hyper terminal for windows, quick term for mac, Cutecom for Raspberry Pi, I’ve used the latter two software)
⁃     Once you are sure communication parameters ok, now plugging three cables of ST1 network for listening data of boat. For this you may either use open plotter serial facility or SignalK Server Connections section, both will end up to same result, though open plotter might be easier. Trick is to identify correct port of your tiny, look for something containing “FT232R” in the identified connections, to be sure you may unplug all other usb inputs to SignalK server.
⁃     Please note that in SignalK Server Connections you will find “Output Events” text box and what you type in here, must be identical to AutoPilot Control plugin’s “NMEA 0183 outputEvent for the Seatalk Connection” textbox! Such as both filled with “seatalkOut” text.
⁃     Now time to power up ST1 network and check if data flowing to SignalK server via data browser window of SignalK, if you see data great, if not check everything once again. If this is ok, now check that WilhelmSK also receives data from ST1 via SignalK server of the boat.
⁃     Based on my experience, you need to reflect sentences as $STALK format and this is achieved via configuration of tiny function 0, default setup from 0 to 1, it is explained in tiny user manual how to setup tiny parameters, thus I won’t repeat here again.
⁃     AutoPilot Plugin
⁃     Install this plugin via webapps
⁃     Select AutoPilot type as Seatalk 1 and remember to fill the NMEA0183... box, exactly same as the “Output Events”
⁃     Activate and restart SignalK server
⁃     Convert SignalK to NMEA0183 Plugin
⁃     Install and activate this plugin via webapps
⁃     I have turned on APB, MVW, RMB, RMC, XTE parameters for autopilot communication
3.   Now better to start Raspberry then you will see a SignalK path of steering.autopilot.status as “standby” in data browser window (patience, sometimes it takes up to 30 seconds). Now, that is good news! I’ve configured my tiny as “tiny” in SignalK Server Communications section so I can get this path from the source “tiny.ST” in the boat.
⁃     WilhemSK has two very good autopilot gadgets (big and small) and when connected you will see it as “standby” on, when you tap auto it will be activated and will show heading and other buttons will be alive and could be activated.
⁃     So you are now ready for using itJ
⁃     Although not necessary, in WilhelmSK page, you may also place a “generic string” based on steering.autopilot.status path to be sure SignalK is reflection of AP status. (I used this to be sure the path is alive and observed some delays based on my data density and my system speed.
Foot Notes:
*Warning:
That is just a trial and test for fun, nothing can replace good seamanship and if you will try similar test and trials, please accept as solely your own risk!
When this document prepared limited sea trials has been made.
Thanks:
Many thanks to SignalK developers, contributors and users; Wilhelm SK developer and TinyNMEA-USB developer for this fun.
<br>
Links:
<br>
http://signalk.org
https://www.wilhelmsk.com
https://www.gadgetpool.eu
