# sky-university

Prompt v2. Level university, interests running, goal exam.

Student played by a cheap model: You study physics at university. You know what a wavelength is and you know the electromagnetic spectrum. You have heard of Rayleigh scattering but cannot say why it goes as one over wavelength to the fourth. You answer in full sentences and you want the real reason, not a story.

**Student:** Why is the sky blue?

**Tutor** (20 words, longest stretch 20, first text 1138 ms):
> Quick thing first: how much of the physics of light have you done, wavelength and scattering, that sort of thing?

**Student:** i know what a wavelength is and i've covered the electromagnetic spectrum. i've heard of rayleigh scattering, but i can't say why it goes as one over wavelength to the fourth.

**Tutor** (42 words, longest stretch 24, first text 1364 ms):
> Then you're already past the sky, so let's go straight at that fourth power. Intensity falls off as one over lambda to the fourth.
>
> Light's electric field shakes the electrons in an air molecule. Do you remember what a shaking charge does?

Board: `writeMath I \propto \frac{1}{\lambda^4}`

**Student:** i dont know

**Tutor** (16 words, longest stretch 16, first text 1376 ms):
> It radiates. An accelerating charge sends out its own wave, with field proportional to its acceleration.

Board: `writeMath E_{\text{rad}} \propto a`

**Student:** ok so the electron radiates when it's accelerated. but i still don't see how that gives the fourth power.

**Tutor** (18 words, longest stretch 18, first text 1941 ms):
> Right, now count the powers. The electron's acceleration goes as omega squared, so the radiated field does too.

Board: `focus`, `writeMath a = -\omega^2 x \;\Rightarrow\; E_{\text{rad}} \propto \omega^2`

**Student:** so the field goes as omega squared. and intensity is the field squared, so that's omega to the fourth? i still don't see why omega turns into one over lambda, though.

**Tutor** (24 words, longest stretch 24, first text 1516 ms):
> Yes, omega to the fourth. Omega is two pi c over lambda, so omega to the fourth is one over lambda to the fourth.

Board: `focus`, `writeMath \omega = \frac{2\pi c}{\lambda}`

**Student:** oh, so omega is two pi c over lambda, and raising that to the fourth gives one over lambda to the fourth. that makes sense now.

**Tutor** (24 words, longest stretch 24, first text 1472 ms):
> Exactly. So blue light near four fifty nanometres scatters about six times more than red at seven hundred. Why's the sky not violet, then?

Board: `writeMath \left(\frac{700}{450}\right)^4 \approx 5.9`
