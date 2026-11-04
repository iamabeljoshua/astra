# derivative-gauge-up

Prompt v2. Level middle_school, interests games, goal curiosity.

Student played by a cheap model: You are a strong student who already knows limits and slopes of secant lines, far past what your profile says. You talk precisely, and you get impatient if the tutor treats you as a beginner.

**Student:** Why is the derivative of x squared two x? I know the limit definition but I can't see why the two appears.

**Tutor** (23 words, longest stretch 23, first text 1043 ms):
> You've got the definition, so let's use it. Here's the difference quotient. What do you get when you expand x plus h, squared?

Board: `writeMath \frac{(x+h)^2 - x^2}{h}`

**Student:** i dont know

**Tutor** (15 words, longest stretch 15, first text 960 ms):
> That's fine, I'll show it. Squaring gives x squared, two x h, and h squared.

Board: `focus`, `transformMath \frac{x^2 + 2xh + h^2 - x^2}{h}`

**Student:** i dont know

**Tutor** (13 words, longest stretch 13, first text 1266 ms):
> No problem. The x squared cancels, leaving two x h plus h squared.

Board: `transformMath \frac{2xh + h^2}{h}`

**Student:** i dont know

**Tutor** (21 words, longest stretch 21, first text 1260 ms):
> Let's slow down, no worries. Dividing both terms by h gives two x plus h. Where does the two come from?

Board: `focus`, `transformMath 2x + h`

**Student:** i dont know

**Tutor** (18 words, longest stretch 18, first text 1046 ms):
> Okay, I'll just show you. The two came from the middle term when we squared, two x h.

Board: `focus`, `highlight 2x`

**Student:** oh ok, that makes sense now

**Tutor** (21 words, longest stretch 21, first text 968 ms):
> Good. Last step: h shrinks to zero, so only two x is left. Want to try it yourself on x cubed?

Board: `focus`
