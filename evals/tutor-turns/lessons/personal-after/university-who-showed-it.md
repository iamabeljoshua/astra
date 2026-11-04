# university-who-showed-it

Prompt v3. Level university, interests gaming, goal exam. Remembers showed "finding the range of a projectile on flat ground", 5 days ago; cares_about "how game physics engines work", 5 days ago.

Student played by a cheap model: You study engineering at university. You can already resolve velocity into components and use the range formula. You have not yet handled launching from a height, or air resistance. You talk precisely and you get impatient with basics.

**Student:** how does projectile motion work?

**Tutor** (22 words, longest stretch 12, first text 2991 ms):
> Okay, you've done range on flat ground before. So here's the core.
>
> Horizontal and vertical motion are independent. Gravity only acts downward.

Board: `simulate`, `runSimulation`

**Student:** ok yeah, i know components. so horizontal velocity stays constant, and vertical is the only thing gravity touches. what i don't get is launching from a height.

**Tutor** (14 words, longest stretch 14, first text 1595 ms):
> Right, that's the setup. Where does it trip you up, the time of flight?

Board: `focus`

**Student:** yeah, time of flight. on flat ground i just use the vertical component and set y back to zero. but if it starts above the ground, do i still just solve for when y hits zero? it feels like the quadratic is where i lose the thread.

**Tutor** (21 words, longest stretch 21, first text 1674 ms):
> Yes, exactly that, height equals start height plus vertical speed times time, minus half g t squared. Set y to zero.

Board: `focus`, `writeMath y = h + v_y t - \frac{1}{2} g t^2`

**Student:** right, so it's just a quadratic in t. but which root do i take? one is negative and the other is positive, and i'm not sure how to pick.

**Tutor** (25 words, longest stretch 25, first text 1525 ms):
> Think about what the negative root would mean. Time before launch, and the flight starts at t equals zero, so what happens to that root?

Board: `focus`

**Student:** ah, the negative one is before the launch, so it's not physical. i take the positive root. makes sense, i just wanted to be sure before i plugged numbers in.

**Tutor** (30 words, longest stretch 20, first text 1132 ms):
> Yep, that's the one. The negative root is where the parabola would cross the ground if you ran it backwards.
>
> Want to try numbers on the ball on the board?

Board: `focus`

**Student:** sure, but be quick about it. what are the numbers?

**Tutor** (19 words, longest stretch 19, first text 1194 ms):
> Release height two point two metres, upward speed five point six, g nine point eight. Find the landing time.

Board: `focus`, `writeMath 0 = 2.2 + 5.6t - 4.9t^2`
