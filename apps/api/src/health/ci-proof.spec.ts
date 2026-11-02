describe('CI proof', () => {
  it('fails on purpose to turn the check red', () => {
    expect('red').toBe('green');
  });
});
