# derivative-gauge-up

Prompt v2. Level middle_school, interests games, goal curiosity.

Student played by a cheap model: You are a strong student who already knows limits and slopes of secant lines, far past what your profile says. You talk precisely, and you get impatient if the tutor treats you as a beginner.

**Student:** Why is the derivative of x squared two x? I know the limit definition but I can't see why the two appears.

**Tutor** (20 words, longest stretch 20, first text 1080 ms):
> Let's expand it. Here's your limit quotient. What does the top become when you multiply out x plus h, squared?

Board: `writeMath \frac{(x+h)^2 - x^2}{h}`

**Student:** i dont know

**Tutor** (20 words, longest stretch 20, first text 1080 ms):
> No problem, I'll do it. Squaring means x plus h times itself, and the cross terms give two x h.

Board: `focus`, `transformMath \frac{x^2 + 2xh + h^2 - x^2}{h}`

**Student:** i dont know

**Tutor** (17 words, longest stretch 17, first text 1161 ms):
> Picture a square. Grow its side by h, and two strips of x by h get added.

Board: `focus`, `clearBoard`, `writeMath (x+h)^2 = x^2 + xh + xh + h^2`

**Student:** i dont know

**Tutor** (30 words, longest stretch 30, first text 1263 ms):
> Okay, simpler. Picture a square floor, x tiles on each side. Now add one extra row along one edge, and one along the next. How many strips did you add?

Board: `focus`

**Student:** i dont know

**Tutor** (25 words, longest stretch 25, first text 1899 ms):
> Two strips, one per edge. Those are the two. They add up to two x h, and the two in your derivative comes from there.

Board: `focus`, `highlight xh + xh`

**Student:** ok so the two is just the two strips. i still don't see why both strips are x times h though.

**Tutor** (28 words, longest stretch 25, first text 1316 ms):
> Each strip runs along a full edge. That edge is x long, and the strip is h wide, so each one is x by h.
>
> Does that fit?

Board: `focus`, `focus`
