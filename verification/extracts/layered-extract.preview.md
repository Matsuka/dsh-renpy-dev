
## layeredimage / pattern-and-format-function
- **layeredimage.format_function(what, name, group, variant, attribute, image, image_format, **kwargs)**: This is called to format the information about an attribute
or condition into a displayable. This can be replaced by a
creator, but the new function should ignore unknown kwargs.

whatA string giving a description of the thing being formatted,
which is used to create better error messages.
- **what**: The name of the layeredimage.
- **name**: The group of an attribute, None if not supplied or if it's
part of a condition.
- **group**: The variant argument to the group, or None if it is not
supplied.
- **variant**: The attribute itself.
- **attribute**: Either a displayable or string.
- **image**: The image_format argument of the LayeredImage.
- **image_format**: 
```
layeredimage augustina work:
group eyes variant blue:
attribute closed
```
- The name of the layeredimage, with spaces replaced with underscores.
- The name of the group, if we are in a non-multiple group.
- The name of the variant, if there is one.
- The name of the attribute.

## layeredimage / proxying-layered-images
- **class LayeredImageProxy(name, transform=None)**: This is an image-like object that proxies attributes passed to it to
another layered image.

nameA string giving the name of the layeredimage to proxy to.
- **name**: If given, a transform or list of transforms that are applied to the
image after it has been proxied.
- **transform**: 
```
image dupe = LayeredImageProxy("augustina")
```
```
image side augustina = LayeredImageProxy("augustina", Transform(crop=(0, 0, 362, 362), xoffset=-80))
```
```
image sepia_augustina_one = Transform("augustina", matrixcolor=SepiaMatrix())
image sepia_augustina_two = LayeredImageProxy("augustina", Transform(matrixcolor=SepiaMatrix()))
```
```
show augustina happy eyes_blue dress
```
```
show sepia_augustina_one happy eyes_blue dress
# won't work, because Transform doesn't take attributes

show sepia_augustina_two happy eyes_blue dress
# will work, and show "augustina happy eyes_blue dress" in sepia effect
```