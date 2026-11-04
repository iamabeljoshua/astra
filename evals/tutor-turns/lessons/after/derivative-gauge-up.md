# derivative-gauge-up

Prompt v2. Level middle_school, interests games, goal curiosity.

Student played by a cheap model: You are a strong student who already knows limits and slopes of secant lines, far past what your profile says. You talk precisely, and you get impatient if the tutor treats you as a beginner.

**Student:** Why is the derivative of x squared two x? I know the limit definition but I can't see why the two appears.

**Tutor** (12 words, longest stretch 12, first text 1304 ms):
> Let's run the definition. Expand that top part. What do you get?

Board: `writeMath \frac{(x+h)^2 - x^2}{h}`

**Student:** i dont know

**Tutor** (14 words, longest stretch 14, first text 1286 ms):
> That's fine. Squaring x plus h gives x squared, two x h, h squared.

Board: `transformMath \frac{x^2 + 2xh + h^2 - x^2}{h}`

**Student:** i dont know

**Tutor** (13 words, longest stretch 13, first text 1262 ms):
> Okay, I'll just show it. The x squareds cancel. Then h divides out.

Board: `focus`, `highlight x^2`, `transformMath \frac{2xh + h^2}{h}`

**Student:** i dont know

**Tutor** (23 words, longest stretch 23, first text 1193 ms):
> Picture a square with side x. Dividing by h leaves two x plus h, and as h shrinks to nothing, that's two x.

Board: `focus`, `transformMath 2x + h`

**Student:** i dont know

**Tutor** (39 words, longest stretch 33, first text 1269 ms):
> Let's go simpler. Imagine a square of side x, then stretch each side by a tiny bit h. The new strip is two skinny rectangles, each x long, so two x of edge.
>
> That's where the two comes from.

Board: `focus`

**Student:** i dont know

**Tutor** (18 words, longest stretch 18, first text 1282 ms):
> Okay, that's on me for going too fast. Which part lost you: the expanding, or the square picture?

Board: `focus`
