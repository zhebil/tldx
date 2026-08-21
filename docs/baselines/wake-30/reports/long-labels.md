layout-report: tests/corpus/long-labels.tldsl.jsx

== Geometry ==
id              parent       x    y    w    h
gateway         long-labels  0    0    903  60
auth            long-labels  988  0    885  60
rate-limiter    long-labels  0    100  903  60
router          long-labels  988  100  912  60
orders          long-labels  0    200  921  60
inventory       long-labels  988  200  903  60
payments        long-labels  0    300  894  60
notifier        long-labels  988  300  912  60
audit           long-labels  0    400  948  60
reporting       long-labels  988  400  939  60
note-reporting  long-labels  0    500  200  632
note-payments   long-labels  988  500  200  662

== Metrics ==
canvas: 1927 x 1162
aspect ratio: 1.66
fill ratio (leaf area / canvas area): 0.360
overlapping shape pairs: 0
edge-edge crossings: 1
total edge length: 4446
mean edge length: 556
edges skipped (unresolved endpoint): 0
edges crossing a frame boundary they don't belong to: 0
arrow paths crossing a non-endpoint shape: 1
source-order violations per container:
  long-labels (grid): 0
left-edge alignment groups per container:
  long-labels: 2 groups over 12 children

== ASCII Render (100x30 cells; 1 cell = 19.3 x 38.7 px) ==
The API gateway receives every inbound request     The authentication service checks the bearer t   
                       ...................................................                          
|---------------------------------------------|    |----------------------------------------------| 
|The rate limiter tracks request counts per cl|    |The router inspects the request path and dispa| 
|---------------------------------------------|  ..|----------------------------------------------| 
The order service validates the cart contents an.  The inventory service reserves stock for each l  
                        ...................................................                         
|---------------------------------------------|    |----------------------------------------------| 
|The payment service charges the customer's ca|....|The notification service sends a confirmation | 
|---------------------------------------------|    |----------------------------------------------| 
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
