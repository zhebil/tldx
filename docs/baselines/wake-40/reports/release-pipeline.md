layout-report: tests/corpus/release-pipeline.tldsl.jsx

== Geometry ==
id             parent            x     y    w    h
commit         release-pipeline  0     0    165  60
lint           release-pipeline  232   0    120  60
unit           release-pipeline  446   0    138  60
build          release-pipeline  642   0    147  60
scan           release-pipeline  883   0    165  60
integration    release-pipeline  1123  0    201  60
publish        release-pipeline  0     180  192  60
staging        release-pipeline  232   180  174  60
smoke          release-pipeline  446   180  147  60
approval       release-pipeline  642   180  183  60
canary         release-pipeline  883   180  129  60
metrics        release-pipeline  1123  180  165  60
rollout        release-pipeline  0     400  156  60
rollback       release-pipeline  232   400  120  60
notify         release-pipeline  446   400  156  60
archive        release-pipeline  642   400  201  60
note-rollback  release-pipeline  883   400  200  392

== Metrics ==
canvas: 1324 x 792
aspect ratio: 1.67
fill ratio (leaf area / canvas area): 0.221
overlapping shape pairs: 0
edge-edge crossings: 7
total edge length: 9473
mean edge length: 474
edges skipped (unresolved endpoint): 0
edges crossing a frame boundary they don't belong to: 0
source-order violations per container:
  release-pipeline (grid): 0
left-edge alignment groups per container:
  release-pipeline: 6 groups over 17 children

== ASCII Render (100x30 cells; 1 cell = 13.2 x 26.4 px) ==
|-----------|    |--------|      |----------|   |----------|      |-----------|     |--------------|
|Commit push|....|Lint....|......|Unit tests|...|Build imag|......|Security sc|.....|Integration te|
|-----------|    |--------|      |----------|   |----------|......|-----------|.....|--------------|
                                                 ..........  ............                           
                                        .....................    ..                                 
                               ..................              ..                                   
                     ................                       ...                                     
|-------------|..|------------|  |----------|   |-------------|   |---------|       |-----------|   
|Push to regis|..|Deploy stagi|..|Smoke test|...|Manual approv|...|Canary 5%|.......|Watch metri|   
|-------------|  |------------|  |----------|   |-------------|   |---------|.......|-----------|   
          ..                           .            ..          ..............                      
            ..                         .         ...  ...............                               
              ..                       .   ..................                                       
                ..               .......... ........                                                
                  ..  ...........  ..........                                                       
|-----------|....|--------|......|-----------|  |--------------|  |--------------|                  
|Full rollou|....|Rollback|......|Notify Slac|..|Archive artifa|  |              |                  
|-----------|    |--------|      |-----------|  |--------------|  |              |                  
                                                                  |              |                  
                                                                  |              |                  
                                                                  |              |                  
                                                                  |              |                  
                                                                  |Rollback re-de|                  
                                                                  |              |                  
                                                                  |              |                  
                                                                  |              |                  
                                                                  |              |                  
                                                                  |              |                  
                                                                  |              |                  
                                                                  |--------------|                  
