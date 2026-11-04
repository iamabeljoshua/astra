"""How a number reads on screen, so a label cannot show 2.9999999 or 1000000."""
from decimal import ROUND_HALF_EVEN, Decimal, localcontext

MINUS = "−"


def _rounded(number, places):
    with localcontext() as context:
        context.prec = 40
        return Decimal(repr(float(number))).quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_EVEN)


def num(number, places=0):
    """Groups thousands, keeps exactly `places` decimals, and writes a true minus sign."""
    rounded = _rounded(number, places)
    text = f"{abs(rounded):,.{places}f}"
    return f"{MINUS}{text}" if rounded < 0 else text


def money(number, places=0, symbol="$"):
    rounded = _rounded(number, places)
    text = f"{symbol}{abs(rounded):,.{places}f}"
    return f"{MINUS}{text}" if rounded < 0 else text


def percent(fraction, places=0):
    return f"{num(float(fraction) * 100, places)}%"
