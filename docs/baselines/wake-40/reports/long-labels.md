layout-report: tests/corpus/long-labels.tldsl.jsx

== Geometry ==
id              parent       x    y    w    h
gateway         long-labels  0    0    903  60
auth            long-labels  988  0    885  60
rate-limiter    long-labels  0    180  903  60
router          long-labels  988  180  912  60
orders          long-labels  0    280  921  60
inventory       long-labels  988  280  903  60
payments        long-labels  0    460  894  60
notifier        long-labels  988  460  912  60
audit           long-labels  0    600  948  60
reporting       long-labels  988  600  939  60
note-reporting  long-labels  0    700  200  632
note-payments   long-labels  988  700  200  662

== Metrics ==
canvas: 1927 x 1362
aspect ratio: 1.41
fill ratio (leaf area / canvas area): 0.307
overlapping shape pairs: 0
edge-edge crossings: 1
total edge length: 4805
mean edge length: 601
edges skipped (unresolved endpoint): 0
edges crossing a frame boundary they don't belong to: 0
source-order violations per container:
  long-labels (grid): 0
left-edge alignment groups per container:
  long-labels: 2 groups over 12 children

== ASCII Render (100x35 cells; 1 cell = 19.3 x 38.9 px) ==
The API gateway receives every inbound request     The authentication service checks the bearer t   
                       ...................................................                          
                       .                                                 .                          
                       .                                                 .                          
|---------------------------------------------|    |----------------------------------------------| 
|The rate limiter tracks request counts per cl|    |The router inspects the request path and dispa| 
|---------------------------------------------|  ..|----------------------------------------------| 
The order service validates the cart contents an.  The inventory service reserves stock for each l  
                        ...................................................                         
                        .                                                                           
                        .                                                                           
|---------------------------------------------|    |----------------------------------------------| 
|The payment service charges the customer's ca|....|The notification service sends a confirmation | 
|---------------------------------------------|    |----------------------------------------------| 
                        .                                                                           
The audit log service records every state transiti The reporting service aggregates completed orders
                        .                                                                           
|---------|                                        |---------|                                      
|         |                                        |         |                                      
|         |                                        |         |                                      
|         |                                        |         |                                      
|         |                                        |         |                                      
|         |                                        |         |                                      
|         |                                        |         |                                      
|         |                                        |         |                                      
|Reporting|                                        |Payment c|                                      
|         |                                        |         |                                      
|         |                                        |         |                                      
|         |                                        |         |                                      
|         |                                        |         |                                      
|         |                                        |         |                                      
|         |                                        |         |                                      
|         |                                        |         |                                      
|---------|                                        |         |                                      
                                                   |---------|                                      
