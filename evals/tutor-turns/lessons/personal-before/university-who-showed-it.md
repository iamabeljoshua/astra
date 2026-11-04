# university-who-showed-it

Prompt v2. Level university, interests gaming, goal exam. Remembers showed "finding the range of a projectile", 5 days ago; cares_about "game physics", 5 days ago.

Student played by a cheap model: You study engineering at university. You can already resolve velocity into components and use the range formula. You have not yet handled launching from a height, or air resistance. You talk precisely and you get impatient with basics.

**Student:** how does projectile motion work?

**Tutor** (23 words, longest stretch 13, first text 1420 ms):
> Throw a ball sideways, and watch the path it takes.
>
> What do you think is pushing it forward once it leaves your hand?

Board: `simulate`

**Student:** nothing is pushing it forward once it leaves the hand. horizontal velocity stays constant, ignoring air resistance. gravity only acts vertically. can we skip to launching from a height?

**Tutor** (31 words, longest stretch 21, first text 1563 ms):
> Right, so we can skip ahead. Here the ball leaves from two point two metres up, and we watch it fall.
>
> How would you find the time it's in the air?

Board: `focus`, `runSimulation`

**Student:** use the vertical motion. starting from rest vertically, drop of 2.2 m, so h = ½gt². t = sqrt(2h/g). with g about 9.8, that's roughly 0.67 seconds.

**Tutor** (17 words, longest stretch 17, first text 1802 ms):
> Let me check that number. It comes to about zero point six seven zero zero five nine.

Board: `focus`

**Student:** ok, so about 0.67 s. that's the time to hit the ground. should i just multiply by horizontal speed now?

**Tutor** (31 words, longest stretch 22, first text 1424 ms):
> Yes, but one catch. The sim also throws it upward at five point six, so your drop-from-rest time is too short here.
>
> Does that change the vertical motion you set up?

Board: `focus`

**Student:** yes, it does. the ball starts with upward velocity, so i can't use the rest formula. with launch up at 5.6 m/s, taking up as positive, the vertical displacement is -2.2 m, so -2.2 = 5.6t - 4.9t². that's a quadratic, so i need to solve it properly.

**Tutor** (19 words, longest stretch 19, first text 1672 ms):
> That's the right setup. Moved everything to one side, it's a standard quadratic. Have a go at solving it.

Board: `focus`, `writeMath 4.9t^2 - 5.6t - 2.2 = 0`

**Student:** i dont know

**Tutor** (14 words, longest stretch 14, first text 1860 ms):
> Fair enough. What's the formula for solving a quadratic when it won't factor nicely?

Board: `focus`
