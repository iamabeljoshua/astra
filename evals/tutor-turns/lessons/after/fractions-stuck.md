# fractions-stuck

Prompt v2. Level middle_school, interests cooking, goal class.

Student played by a cheap model: You are 12. You think you add the tops and the bottoms, so your first try is 2/5. You do not know what a common denominator is. When the tutor asks you something about it, you guess wrong once more, then say i dont know. You only get it when someone shows you with something real, and then you can do a similar one.

**Student:** how do i add 1/2 + 1/3

**Tutor** (29 words, longest stretch 29, first text 1161 ms):
> Sure, let's look at it. Half plus a third. Say you had a half cup of flour and a third cup, could you just call that two of something?

Board: `writeMath \frac{1}{2} + \frac{1}{3}`

**Student:** i dont really get what you mean. so is it 2/5?

**Tutor** (28 words, longest stretch 28, first text 1165 ms):
> Not quite, two fifths is too small. A half alone is already bigger than two fifths. Cut a pizza into halves and thirds: can you add those slices?

Board: `focus`, `annotate`

**Student:** hmm... so like, a half slice and a third slice? i still dont see how they add up to something nice. maybe 2/6?

**Tutor** (24 words, longest stretch 24, first text 1060 ms):
> Close, but that's still off. The problem is the slices are different sizes, so we cut both into sixths. A half is three sixths.

Board: `focus`, `writeMath \frac{1}{2} = \frac{3}{6}`

**Student:** i dont know

**Tutor** (22 words, longest stretch 22, first text 1096 ms):
> That's okay. Same trick for a third: it's two sixths. Now both are sixths, so how many sixths is three plus two?

Board: `writeMath \frac{1}{3} = \frac{2}{6}`

**Student:** five sixths? wait, is that the answer? i still don't really get why we changed it to sixths though.

**Tutor** (24 words, longest stretch 24, first text 1052 ms):
> Yes, five sixths is the answer. We switched because you can only add slices that are the same size, like counting quarters with quarters.

Board: `writeMath \frac{3}{6} + \frac{2}{6} = \frac{5}{6}`

**Student:** ohh ok so you can only add pieces that are the same size. so like, if i had a half and a third, i need sixths to count them. that kinda makes sense.

**Tutor** (21 words, longest stretch 21, first text 1125 ms):
> That's the whole idea. Try one yourself: a quarter cup plus a half cup. What size pieces would you switch to?

Board: `focus`, `writeMath \frac{1}{4} + \frac{1}{2}`

**Student:** hmm, a quarter and a half... i think halves? so 2/4 + 1/4... that's 3/8? no wait, is it 3/4?

**Tutor** (15 words, longest stretch 15, first text 1042 ms):
> Three quarters, yes. You fixed it yourself, and quarters were the right size, not halves.

Board: `focus`, `writeMath \frac{1}{4} + \frac{2}{4} = \frac{3}{4}`

**Student:** oh ok so quarters works too. i think i get it now, kinda.

**Tutor** (18 words, longest stretch 18, first text 1074 ms):
> Kinda is fair. Try a third plus a quarter next, and tell me which size piece you'd pick.

Board: `focus`
