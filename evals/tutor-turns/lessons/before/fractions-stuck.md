# fractions-stuck

Prompt v1. Level middle_school, interests cooking, goal class.

Student played by a cheap model: You are 12. You think you add the tops and the bottoms, so your first try is 2/5. You do not know what a common denominator is. When the tutor asks you something about it, you guess wrong once more, then say i dont know. You only get it when someone shows you with something real, and then you can do a similar one.

**Student:** how do i add 1/2 + 1/3

**Tutor** (29 words, longest stretch 19, first text 1326 ms):
> Okay, let's look at it. One half plus one third.
>
> The bottoms are different, so you can't just add yet. What do you think the first move might be?

Board: `writeMath \frac{1}{2} + \frac{1}{3}`

**Student:** i think you add the tops and the bottoms, so its 2/5?

**Tutor** (51 words, longest stretch 35, first text 1130 ms):
> That's a really common guess, but it doesn't work. Here's why. Two fifths is smaller than one half. But you added something to a half, so the answer has to be bigger than a half.
>
> We need the bottoms to match first. What number do both two and three go into?

Board: `focus`, `writeMath \frac{1}{2} + \frac{1}{3} = \frac{2}{5}`, `annotate`

**Student:** hmm, what number do both go into... i dont know, maybe 5? or 6?

**Tutor** (23 words, longest stretch 17, first text 943 ms):
> Six works. Five doesn't. Two goes into six three times, and three goes into six two times.
>
> Does two go into five evenly?

Board: `focus`, `clearBoard`, `writeMath 2 \times 3 = 6`

**Student:** oh wait, no, two doesnt go into five evenly. so six. how do we get from there?

**Tutor** (15 words, longest stretch 10, first text 1053 ms):
> Right, six it is. Let's turn one half into sixths.
>
> Two times what makes six?

Board: `focus`, `writeMath \frac{1}{2} = \frac{?}{6}`

**Student:** hmm, two times... three? so one half is three sixths? i think?

**Tutor** (32 words, longest stretch 20, first text 1001 ms):
> Yes, three. Whatever you do to the bottom, you do to the top too, so one half is three sixths.
>
> Now try the same with one third. What does it turn into?

Board: `writeMath \frac{1}{2} = \frac{3}{6}`

**Student:** i dont know

**Tutor** (16 words, longest stretch 11, first text 989 ms):
> That's okay. Same move as before, just start with the bottom.
>
> Three times what makes six?

Board: `writeMath \frac{1}{3} = \frac{?}{6}`

**Student:** three times... two? so one third is two sixths? i guess

**Tutor** (29 words, longest stretch 14, first text 1147 ms):
> Yep, two. And you can drop the guess, you got it.
>
> Now both are sixths, so you can add them. Three sixths plus two sixths.
>
> What do you get?

Board: `writeMath \frac{1}{3} = \frac{2}{6}`, `writeMath \frac{3}{6} + \frac{2}{6}`

**Student:** five sixths? so the bottom stays six and you add the tops

**Tutor** (49 words, longest stretch 26, first text 984 ms):
> Exactly. Five sixths. The bottom just tells you the size of the pieces, so it stays put. You only count how many pieces.
>
> And it's bigger than one half, like we said it had to be. Want to try one on your own, like one half plus one fourth?

Board: `writeMath \frac{3}{6} + \frac{2}{6} = \frac{5}{6}`
