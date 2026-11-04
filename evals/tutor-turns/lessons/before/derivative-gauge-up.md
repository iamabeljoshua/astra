# derivative-gauge-up

Prompt v1. Level middle_school, interests games, goal curiosity.

Student played by a cheap model: You are a strong student who already knows limits and slopes of secant lines, far past what your profile says. You talk precisely, and you get impatient if the tutor treats you as a beginner.

**Student:** Why is the derivative of x squared two x? I know the limit definition but I can't see why the two appears.

**Tutor** (40 words, longest stretch 15, first text 1979 ms):
> Let's expand it. Here's the limit's top and bottom, with x plus h squared.
>
> Squaring x plus h gives two copies of x times h, one from each order.
>
> That's your two. What do you get after dividing by h?

Board: `writeMath \frac{(x+h)^2 - x^2}{h}`, `writeMath \frac{x^2 + 2xh + h^2 - x^2}{h}`, `highlight 2xh`

**Student:** i dont know

**Tutor** (38 words, longest stretch 16, first text 1749 ms):
> That's okay. The x squared terms cancel, leaving two x h plus h squared on top.
>
> Every term has an h, so dividing by h leaves two x plus h.
>
> Now let h shrink to zero. What's left?

Board: `transformMath \frac{2xh + h^2}{h}`, `transformMath 2x + h`

**Student:** ok so it's 2x plus h, and h goes to zero, so 2x. i get that now.

**Tutor** (45 words, longest stretch 21, first text 1234 ms):
> Right, that's it. So the derivative of x squared is two x.
>
> The two came from the cross terms. Squaring means x times x, and a nudge h can land in either copy.
>
> Try the same steps on x cubed and see what shows up.

Board: `focus`, `hide`, `writeMath \frac{d}{dx}x^2 = 2x`

**Student:** sure, but i'm not sure i'll get the coefficient right on that one. (x+h)^3 has a bunch of terms, so i'd guess 3x^2 from the pattern, but i'd need to expand it to be sure.

**Tutor** (48 words, longest stretch 30, first text 1712 ms):
> Your guess is right, so go check it. Think of three copies of x plus h multiplied together.
>
> Only terms with exactly one h matter, since the rest vanish after dividing by h and shrinking it. How many ways can you pick the h from just one copy?

Board: `focus`, `clearBoard`, `writeMath (x+h)^3 = (x+h)(x+h)(x+h)`

**Student:** the h can come from any of the three copies, and each pick leaves x squared, so that's three x squared. three ways, so 3x^2.

**Tutor** (54 words, longest stretch 20, first text 1160 ms):
> Exactly, and that's the whole trick. Expanded, the one-h term is three x squared h.
>
> Subtract x cubed, divide by h, and shrink h. Only that term survives, so the derivative is three x squared.
>
> It also explains the pattern. For x to the n, there are n copies to pick the h from.

Board: `focus`, `writeMath (x+h)^3 = x^3 + 3x^2h + 3xh^2 + h^3`, `highlight 3x^2h`

**Student:** right, so for x to the n it's n copies times x to the n minus one, which is the power rule. that's the part i wanted to see.

**Tutor** (41 words, longest stretch 23, first text 1829 ms):
> Yep, you've got it. One h from any of n copies, leaving x to the n minus one.
>
> One caveat: this counting argument works for whole number powers. Fractions and negatives need a different argument, though the same rule still holds.

Board: `focus`, `writeMath \frac{d}{dx}x^n = n x^{n-1}`
