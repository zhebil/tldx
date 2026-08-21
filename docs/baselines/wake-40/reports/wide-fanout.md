layout-report: tests/corpus/wide-fanout.tldsl.jsx

== Geometry ==
id        parent       x    y    w    h
hub       wide-fanout  0    0    138  60
leaf-1    wide-fanout  178  0    120  60
leaf-2    wide-fanout  347  0    120  60
leaf-3    wide-fanout  516  0    120  60
leaf-4    wide-fanout  685  0    120  60
leaf-5    wide-fanout  854  0    120  60
leaf-6    wide-fanout  0    220  120  60
leaf-7    wide-fanout  178  220  120  60
leaf-8    wide-fanout  347  220  120  60
leaf-9    wide-fanout  516  220  120  60
leaf-10   wide-fanout  685  220  129  60
leaf-11   wide-fanout  854  220  129  60
leaf-12   wide-fanout  0    440  129  60
leaf-13   wide-fanout  178  440  129  60
leaf-14   wide-fanout  347  440  129  60
leaf-15   wide-fanout  516  440  129  60
leaf-16   wide-fanout  685  440  129  60
leaf-17   wide-fanout  854  440  129  60
leaf-18   wide-fanout  0    620  129  60
mini-hub  wide-fanout  178  620  129  60
mini-1    wide-fanout  347  620  120  60
mini-2    wide-fanout  516  620  120  60
mini-3    wide-fanout  685  620  120  60
mini-4    wide-fanout  854  620  120  60
mini-5    wide-fanout  0    800  120  60
mini-6    wide-fanout  178  800  120  60

== Metrics ==
canvas: 983 x 860
aspect ratio: 1.14
fill ratio (leaf area / canvas area): 0.229
overlapping shape pairs: 0
edge-edge crossings: 0
total edge length: 12866
mean edge length: 515
edges skipped (unresolved endpoint): 0
edges crossing a frame boundary they don't belong to: 0
source-order violations per container:
  wide-fanout (grid): 0
left-edge alignment groups per container:
  wide-fanout: 6 groups over 26 children

== ASCII Render (100x44 cells; 1 cell = 9.8 x 19.5 px) ==
|-------------|   |-----------|    |-----------|    |-----------|    |-----------|    |-----------| 
|Dispatcher   |   |Worker 1   |    |Worker 2   |    |Worker 3   |    |Worker 4   |    |Worker 5   | 
|      .......|...|...........|....|...........|....|...........|....|...........|....|......     | 
|-------------|...|-----------|    |-----------|    |-----------|    |-----------|    |-----------| 
       ....................                                                                         
       . . ........................                                                                 
       . ..  .  ............ ..............                                                         
       .  ..  ..  .. ............  ....... ........                                                 
      ..  . .   ..  ...  ... .........    ......   .......                                          
      ..   ..     .    ..   ...  .... ....      ......    ........                                  
      ..   . .     ..    ..    ...   .... .....       ......      ........                          
|-----------| .   |-----------|   .|-----------|....|-----------|.   |------------|   |------------|
|Worker 6   |  .  |Worker 7   |.   |Worker 8 ..|.   |Worker 9   | ...|Worker 10   |...|Worker 11   |
|     ..    |. .  |     .     | .. |    ...    | ...|   ...     |    |  ....      |   |   ....     |
|-----------| . . |-----------|   .|-----------|    |-----------|    |------------|   |------------|
      ..      .  .         .        ...       ...       ....                                        
      ..       .  .         ..         ..        ...        ....                                    
      ..       .   .          .          ..         ...         ....                                
      .         .  .           ..          ...         ....         ....                            
      .         .   .            ..           ..           ...          ....                        
      .          .   .             .            ..            ...           ....                    
      .          .    .             ..            ...            ...            ....                
|------------|    |------------|   |------------|   |------------|  .|------------| ..|------------|
|Worker 12   |    |Worker 13   |   |Worker 14   |   |Worker 15   |   |Worker 16   |   |Worker 17   |
|     .      |    |.    .      |   |     .      |   |    ..      |   |    ..      |   |     ..     |
|------------|    |------------|   |------------|   |------------|   |------------|   |------------|
      .             .                                                                               
      .              .                                                                              
      .              .                                                                              
      .               .                                                                             
      .               .                                                                             
|------------|    |------------|   |-----------|    |-----------|    |-----------|    |-----------| 
|Worker 18   |    |Scheduler   |   |Task 1     |    |Task 2     |    |Task 3     |    |Task 4     | 
|     .      |    |    ........|...|...........|....|...........|....|...........|....|......     | 
|------------|    |------------|   |-----------|    |-----------|    |-----------|    |-----------| 
                   ..   .                                                                           
                 ..     .                                                                           
               ..       .                                                                           
             ..         .                                                                           
           ..           .                                                                           
|-----------|     |-----------|                                                                     
|Task 5..   |     |Task 6     |                                                                     
|     .     |     |     .     |                                                                     
|-----------|     |-----------|                                                                     
