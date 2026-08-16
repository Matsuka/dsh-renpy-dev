
## matrixcolor / using-a-matrix-to-change-colors
```
define mymatrix = Matrix([ a, b, c, d,
e, f, g, h,
i, j, k, l,
m, n, o, p, ])
```
```
R' = R * a + G * b + B * c + A * d
G' = R * e + G * f + B * g + A * h
B' = R * i + G * j + B * k + A * l
A' = R * m + G * n + B * o + A * p
```
```
transform swap_red_and green:
matrixcolor Matrix([ 0.0, 1.0, 0.0, 0.0,
1.0, 0.0, 0.0, 0.0,
0.0, 0.0, 1.0, 0.0,
0.0, 0.0, 0.0, 1.0, ])
```

## matrixcolor / colormatrix
```
transform red_blue_tint:
matrixcolor TintMatrix("#f00")
linear 3.0 matrixcolor TintMatrix("#00f")
linear 3.0 matrixcolor TintMatrix("#f00")
repeat
```
```
class TintMatrix(ColorMatrix):
def __init__(self, color):

# Store the color given as a parameter.
self.color = Color(color)

def __call__(self, other, done):

if type(other) is not type(self):

# When not using an old color, we can take
# r, g, b, and a from self.color.
r, g, b = self.color.rgb
a = self.color.alpha

else:

# Otherwise, we have to extract from self.color
# and other.color, and interpolate the results.
oldr, oldg, oldb = other.color.rgb
olda = other.color.alpha
r, g, b = self.color.rgb
a = self.color.alpha

r = oldr + (r - oldr) * done
g = oldg + (g - oldg) * done
b = oldb + (b - oldb) * done
a = olda + (a - olda) * done

# To properly handle premultiplied alpha, the color channels
# have to be multiplied by the alpha channel.
r *= a
g *= a
b *= a

# Return a Matrix.
return Matrix([ r, 0, 0, 0,
0, g, 0, 0,
0, 0, b, 0,
0, 0, 0, a ])
```
- An old object to interpolate off of. This object may be of any class,
and may be None if no old object exists.
- A value between 0.0 and 1.0, representing the point to interpolate.
0.0 is entirely the old object, and 1.0 is entirely the new object.

## matrixcolor / built-in-colormatrix-subclasses
- **class BrightnessMatrix(value=1.0)**: A ColorMatrix that can be used with matrixcolor to change
the brightness of an image, while leaving the Alpha channel
alone.

valueThe amount of change in image brightness. This should be
a number between -1 and 1, with -1 the darkest possible
image and 1 the brightest.
- **value**: 
- **class ColorizeMatrix(black_color, white_color)**: A ColorMatrix that can be used with matrixcolor to colorize
black and white displayables. It uses the color of each pixel
in the black and white to interpolate between the black color
and the white color.
The alpha channel is not touched.
This is intended for use with a black and white image (or one that
has been desaturated with SaturationMatrix()), and will yield
strange results when used with images that are not black and white.

black_color, white_colorThe colors used in the interpolation.
- **black_color, white_color**: 
- **class ContrastMatrix(value=1.0)**: A ColorMatrix that can be used with matrixcolor to change
the contrast of an image, while leaving the Alpha channel
alone.

valueThe contrast value. Values between 0.0 and 1.0 decrease
the contrast, while values above 1.0 increase the contrast.
- **value**: 
- **class HueMatrix(value=1.0)**: A ColorMatrix that can be used with matrixcolor to rotate the hue by
value degrees. While value can be any number, positive or negative,
360 degrees makes a complete rotation. The alpha channel is left alone.
- **class IdentityMatrix**: A ColorMatrix that can be used with matrixcolor that does not
change the color or alpha of what is supplied to it.
- **class InvertMatrix(value=1.0)**: A ColorMatrix that can be used with matrixcolor to invert
each of the color channels. The alpha channel is left alone.

valueThe amount to inverty by. 0.0 is not inverted, 1.0 is fully
inverted. Used to animate inversion.
- **value**: 
- **class OpacityMatrix(value=1.0)**: A ColorMatrix that can be used with matrixcolor to change
the opacity of an image, while leaving color channels alone.

valueThe amount the alpha channel should be multiplied by,
a number between 0.0 and 1.0.
- **value**: 
- **class SaturationMatrix(value, desat=(0.2126, 0.7152, 0.0722))**: A ColorMatrix that can be used with matrixcolor that alters
the saturation of an image, while leaving the alpha channel
alone.

valueThe amount of saturation in the resulting image. 1.0 is
the unaltered image, while 0.0 is grayscale.
- **value**: This is a 3-element tuple that controls how much of the
red, green, and blue channels will be placed into all
three channels of a fully desaturated image. The default
is based on the constants used for the luminance channel
of an NTSC television signal. Since the human eye is
mostly sensitive to green, more of the green channel is
kept than the other two channels.
- **desat**: 
- **SepiaMatrix(tint='#ffeec2', desat=(0.2126, 0.7152, 0.0722))**: A function that returns a ColorMatrix that can be used with matrixcolor
to sepia-tone a displayable. This is the equivalent of:
TintMatrix(tint) * SaturationMatrix(0.0, desat)
- **class SplineMatrix(matrix, spline)**: A Matrix wrapper that uses a spline to interpolate between two
matrices. The spline is used to control how much of each of the
two matrices are used.

matrixThe matrix that will be interpolated to.
- **matrix**: The spline that is used for the interpolation. This must
be a list containing 3 or more floating point numbers. The
The first number is the starting amount (usually 0.0), the
last number is the ending amount (usually 1.0), and the values
in between are the knots:

For a single knot (3-number list), a quadratic curve is used.
For two knots (4-number list), a Bezier spline is used.
For three or more knots, Catmull-Rom splines are used. For
Catmull-Rom splines, the first and last knots (second and
second-last numbers) are control nodes, and the other knots
are the amounts that the spline goes through.
- **spline**: 
- **class TintMatrix(color)**: A ColorMatrix can be used with matrixcolor to tint
an image, while leaving the alpha channel alone.

colorThe color that the matrix will tint things to. This is passed
to Color(), and so may be anything that Color supports
as its first argument.
- **color**: 
```
TintMatrix(tint) * SaturationMatrix(0.0, desat)
```
```
show eileen happy:
center
matrixcolor BrightnessMatrix(0.0)
linear 2.0 matrixcolor SplineMatrix(BrightnessMatrix(1.0), [ 0.0, 1.0, 0.0 ])
repeat
```
- For a single knot (3-number list), a quadratic curve is used.
- For two knots (4-number list), a Bezier spline is used.
- For three or more knots, Catmull-Rom splines are used. For
Catmull-Rom splines, the first and last knots (second and
second-last numbers) are control nodes, and the other knots
are the amounts that the spline goes through.