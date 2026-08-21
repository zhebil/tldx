layout-report: tests/corpus/sparse-graph.tldsl.jsx

== Geometry ==
id   parent        x    y    w    h
n1   sparse-graph  0    160  120  60
n2   sparse-graph  180  160  120  60
n3   sparse-graph  320  160  120  60
n4   sparse-graph  500  160  120  60
n5   sparse-graph  0    240  120  60
n6   sparse-graph  180  240  120  60
n7   sparse-graph  320  240  120  60
n8   sparse-graph  500  240  120  60
n9   sparse-graph  0    320  120  60
n10  sparse-graph  180  320  120  60
n11  sparse-graph  320  320  120  60
n12  sparse-graph  500  320  120  60
n13  sparse-graph  0    400  120  60
n14  sparse-graph  180  400  120  60
n15  sparse-graph  0    0    120  60
n16  sparse-graph  140  0    120  60
n17  sparse-graph  280  0    120  60
n18  sparse-graph  420  0    120  60
n19  sparse-graph  560  0    120  60
n20  sparse-graph  320  400  120  60
n21  sparse-graph  500  400  120  60
n22  sparse-graph  0    80   120  60
n23  sparse-graph  140  80   120  60
n24  sparse-graph  280  80   120  60

== Metrics ==
canvas: 680 x 460
aspect ratio: 1.48
fill ratio (leaf area / canvas area): 0.552
overlapping shape pairs: 0
edge-edge crossings: 0
total edge length: 1440
mean edge length: 180
edges skipped (unresolved endpoint): 0
edges crossing a frame boundary they don't belong to: 0
source-order violations per container:
  sparse-graph (auto): 0
left-edge alignment groups per container:
  sparse-graph: 8 groups over 24 children

== ASCII Render (100x34 cells; 1 cell = 6.8 x 13.5 px) ==
|----------------|  |-----------------|  |----------------|  |-----------------|  |----------------|
|                |  |                 |  |                |  |                 |  |                |
|Node 15         |  |Node 16          |  |Node 17         |  |Node 18          |  |Node 19         |
|                |  |                 |  |                |  |                 |  |                |
|----------------|  |-----------------|  |----------------|  |-----------------|  |----------------|
                                                                                                    
|----------------|  |-----------------|  |----------------|                                         
|                |  |                 |  |                |                                         
|Node 22         |  |Node 23          |  |Node 24         |                                         
|                |  |                 |  |                |                                         
|----------------|  |-----------------|  |----------------|                                         
|----------------|        |-----------------|  |----------------|        |----------------|         
|                |        |                 |  |                |        |                |         
|Node 1          |        |Node 2           |  |Node 3          |        |Node 4          |         
|        ........|........|.........        |  |       .........|........|.........       |         
|                |        |                 |  |                |        |                |         
|----------------|        |-----------------|  |----------------|        |----------------|         
|----------------|        |-----------------|  |----------------|        |----------------|         
|                |        |                 |  |                |        |                |         
|Node 5  ........|........|Node 6...        |  |Node 7 .........|........|Node 8...       |         
|                |        |                 |  |                |        |                |         
|                |        |                 |  |                |        |                |         
|----------------|        |-----------------|  |----------------|        |----------------|         
|----------------|        |-----------------|  |----------------|        |----------------|         
|                |        |                 |  |                |        |                |         
|Node 9  ........|........|Node 10..        |  |Node 11.........|........|Node 12..       |         
|                |        |                 |  |                |        |                |         
|----------------|        |-----------------|  |----------------|        |----------------|         
                                                                                                    
|----------------|        |-----------------|  |----------------|        |----------------|         
|                |        |                 |  |                |        |                |         
|Node 13 ........|........|Node 14..        |  |Node 20.........|........|Node 21..       |         
|                |        |                 |  |                |        |                |         
|----------------|        |-----------------|  |----------------|        |----------------|         
