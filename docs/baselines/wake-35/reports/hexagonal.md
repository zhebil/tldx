layout-report: tests/corpus/hexagonal.tldsl.jsx

== Geometry ==
id                parent            x     y    w     h
hex               hexagonal         0     0    1198  636
driving-adapters  hex               24    200  152   268
http              driving-adapters  40    248  120   60
cli               driving-adapters  40    320  120   60
tests             driving-adapters  40    392  120   60
driving-ports     hex               224   200  197   268
p-create-order    driving-ports     249   248  147   60
p-list-orders     driving-ports     254   320  138   60
p-create-session  driving-ports     240   392  165   60
core              hex               469   236  224   196
usecases          core              517   284  129   60
domain            core              485   356  192   60
driven-ports      hex               741   56   206   556
p-orders-repo     driven-ports      775   104  138   60
p-users-repo      driven-ports      780   176  129   60
p-sessions        driven-ports      766   248  156   60
p-hasher          driven-ports      757   320  174   60
p-payments        driven-ports      784   392  120   60
p-notifications   driven-ports      762   464  165   60
p-clock           driven-ports      784   536  120   60
driven-adapters   hex               995   92   179   484
postgres          driven-adapters   1025  140  120   60
redis             driven-adapters   1025  212  120   60
argon2            driven-adapters   1025  284  120   60
stripe            driven-adapters   1025  356  120   60
ses               driven-adapters   1025  428  120   60
system-clock      driven-adapters   1011  500  147   60

== Metrics ==
canvas: 1198 x 636
aspect ratio: 1.88
fill ratio (leaf area / canvas area): 0.227
overlapping shape pairs: 0
edge-edge crossings: 2
total edge length: 5634
mean edge length: 256
edges skipped (unresolved endpoint): 0
edges crossing a frame boundary they don't belong to: 0
source-order violations per container:
  hexagonal (grid): 0
  hex (row): 0
  driving-adapters (col): 0
  driving-ports (col): 0
  core (col): 0
  driven-ports (col): 0
  driven-adapters (col): 0
left-edge alignment groups per container:
  hexagonal: 1 groups over 1 children
  hex: 5 groups over 5 children
  driving-adapters: 1 groups over 3 children
  driving-ports: 3 groups over 3 children
  core: 2 groups over 2 children
  driven-ports: 6 groups over 7 children
  driven-adapters: 2 groups over 6 children

== ASCII Render (100x27 cells; 1 cell = 12.0 x 23.6 px) ==
+Hexagonal (ports and adapters)--------------------------------------------------------------------+
|                                                                                                  |
|                                                            +Driven ports----+                    |
|                                                            |                |                    |
|                                                            |  |----------|  |   +Driven adapter+ |
|                                                            |  |OrdersRepo|  |   |              | |
|                                                            |  | ...      |..|...|..|---------| | |
|                                                            |  |----------|  |  .|..|Postgres | | |
| +Driving adap+   +Driving ports--+                         |..|UsersRepo.|..|.. |  |---------| | |
| |            |   |               |                      ...|  |...       |  |   |  |---------| | |
| ||---------| |   | |-----------| |   +Domain core------+  .|.|------------| |  .|..|Redis    | | |
| ||HTTP API.|.|...|.|CreateOrder| |   |             ....|.. | |SessionStore|.|.. |  |---------| | |
| ||      ...| |  .|.|..         |.|...|...|---------|...|...|.|.           | |   |  |---------| | |
| ||---------|.|.. | |----------|| |  .|...|Use cases|...|.. | |-------------||  .|..|Argon2   | | |
| ||CLI .... | |...| |ListOrders|..|.. | ..|---------|...|  .|.|PasswordHashe||.. |  |---------| | |
| ||         | |  .|.|..        |  |...||---------------||...| |             ||   |  |---------| | |
| ||---------|.|.. ||------------|.|   ||Entities + rule||.. |.|-|---------|-||  .|..|Stripe   | | |
| ||Tests... | |   ||CreateSessio| |   ||---------------||  .|.  |Payments.|..|.. |  |---------| | |
| ||---------| |   ||------------| |   +-----------------+...| ..|---------|  |   |  |AWS SES  | | |
| +------------+   +---------------+                         |.|-------------||  .|..|.....    | | |
|                                                            | |Notifications||.. | |-----------|| |
|                                                            | |-------------||   | |SystemClock|| |
|                                                            |   |---------|  |  .|.|......     || |
|                                                            |   |Clock....|..|.. | |-----------|| |
|                                                            |   |---------|  |   +--------------+ |
|                                                            +----------------+                    |
+--------------------------------------------------------------------------------------------------+
