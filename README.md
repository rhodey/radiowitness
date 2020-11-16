# RadioWitness
RadioWitness is a [P25](https://en.wikipedia.org/wiki/Project_25) public safety radio archive with a web application and support for cryptographically authenticated mirrors through [Dat Protocol](https://dat.foundation/). Running this software requires two or more [RTLSDR radios](https://osmocom.org/projects/rtl-sdr/wiki/Rtl-sdr) and one or more local **P25 "Phase 1"** public safety radio networks.

## Download & Build
```
$ git clone https://github.com/rhodey/radiowitness && cd radiowitness/
$ git submodule update --init --recursive
$ docker build -t radiowitness .
$ docker build -t usbreset lib/c/usbreset
```

## Search for Radio Networks
Using the [Radio Reference Database](https://www.radioreference.com/apps/db/) find your local county and search the county page for **"Project 25 Phase I"**, for example Austin Texas has the [Greater Austin/Travis Regional Radio System](https://www.radioreference.com/apps/db/?sid=2). If your county has a P25 Phase 1 network there will be a table labeled **"System Frequencies"** and running behind one or more of these frequencies should be a P25 [Control Channel](https://wiki.radioreference.com/index.php/Control_channel). The following example uses `-g` for radio gain and it is shown that frequency `851137500Hz` has the best reception of three control channel candidates:
```
$ chmod +x ./bin/rtl_devices.sh
$ docker run $(./bin/rtl_devices.sh) --rm \
    radiowitness search p25 -g 26 -f "851162500,851287500,851137500" 2> /dev/null
> 851162500 counted 0 frames.
> 851287500 counted 36 frames.
> 851137500 counted 43 frames.
```

## Decode and Play
The following example shows options for `3` RTLSDR radios multiplexed by `2` to support five concurrent radio calls, this is six minus one for the `-f 851137500` control channel. Sample rate `-s 1200000` is chosen because it divides evenly by the P25 channel rate `48000` making for efficient [resampling](https://dspguru.com/dsp/faqs/multirate/resampling/). Gain `-g 0` is automatic gain control but it is recommended that a static value be found using the search command:
```
$ docker run $(./bin/rtl_devices.sh) --rm \
    radiowitness decode p25 --radios 3 --mux 2 -s 1200000 -g 0 -f 851137500 \
      | docker run --rm -i radiowitness play p25 \
        | play -t raw -b 16 -e signed -r 8k -c 1 -
```

## Create Archive
After having successfully tested decoding create a new P25 archive, this example uses directory `/tmp/archive-p25`. Values of **"System ID"**, **"WACN"**, **"RFSS"**, and **"Site"** can all be found on Radio Reference:
```
$ docker run --rm -v /tmp/archive-p25:/archive \
    radiowitness create p25 --name "GATRRS Austin/Travis County" \
      --lat "30.245016" --lon="-97.788914" --sys 318 --wacn 781833 --rfss 1 --site 1
```

## Decode and Archive
The following example will decode, archive and replicate from directory tree `/tmp/archive-p25` using WebSockets on TCP port `8081`:
```
$ docker run $(./bin/rtl_devices.sh) --rm \
    radiowitness decode p25 --radios 3 --mux 2 -s 1200000 -g 26 -f 851137500 \
      | docker run -i -v /tmp/archive-p25:/archive -p 8081:8081 \
          radiowitness archive p25
```

### Multi-Host
Archive P25 decode stream from TCP port `1234` and replicate archive over WebSockets TCP port `8081`. `--limit 1000000` will limit the archive to the most recent one million calls and use storage approximate to **16KB/sec** for recorded audio. One million ten second calls is **160GB** of audio:
```
$ ncat -l -k -p 1234 -c \
    "docker run --rm -i --name vpn.archive-p25 -v /tmp/archive-p25:/archive -p 8081:8081 \
      radiowitness archive p25 --limit 1000000"
```

Decode with connectivity to `vpn.archive-p25` TCP port `1234`:
```
$ time ncat vpn.archive-p25 1234 -c \
    "docker run $(./bin/rtl_devices.sh) --rm \
      radiowitness decode p25 --radios 3 --mux 2 -s 1200000 -g 26 -f 851137500"
```

## Mirrors
Run a mirror if you want to add storage to your archive or mirror someone else. Mirror `vpn.archive-p25` using TCP port `8081`:
```
$ docker run -d --name vpn.mirror-p25 \
    -v /tmp/mirror-p25:/archive -p 8081:8081 \
      radiowitness mirror ws://vpn.archive-p25:8081 --limit 2000000
```

## Web App
```
$ curl http://vpn.archive-p25:8081/dat.json \
    | docker run --rm -i radiowitness config \
        --title "Radio Venceremos" \
        --description "Austin Texas police and fire radio." \
        --host ws://vpn.archive-p25:8081 \
        --host ws://vpn.mirror-p25:8081 > web/config.json
$ cd web/ && npm install && npm run build
$ cd dist/ && python -m SimpleHTTPServer 8080
```

## License
License Zero Reciprocal Public License 2.0.1
