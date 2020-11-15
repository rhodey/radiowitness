# rw-peer
radiowitness peer.

```
$ echo 851287500 | \
  ./bin/radiowitness search -d 0 -g 26 | \
    ./bin/radiowitness http -p 8080
```

## todo
+ pack dibits from rtl_p25 more efficiently
+ don't tune outside sensible range
+ tune radios to not overlap
+ archive trunking control channel as well
