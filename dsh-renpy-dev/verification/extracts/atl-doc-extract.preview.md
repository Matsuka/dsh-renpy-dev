
## properties / zoom-and-flip
- **zoom**: Type:
float
- **Type:**: 1.0
- **Default:**: 
- **xzoom**: Type:
float
- **Type:**: 1.0
- **Default:**: 
- **yzoom**: Type:
float
- **Type:**: 1.0
- **Default:**: 

## properties / pixel-effects
- **nearest**: Type:
boolean
- **Type:**: None
- **Default:**: 
- **alpha**: Type:
float
- **Type:**: 1.0
- **Default:**: 
- **additive**: Type:
float
- **Type:**: 0.0
- **Default:**: 
- **matrixcolor**: Type:
None or Matrix or MatrixColor
- **Type:**: None
- **Default:**: 
- **blur**: Type:
None or float
- **Type:**: None
- **Default:**: 

## properties / polar-positioning
- **around**: Type:
(position, position)
- **Type:**: (0.0, 0.0)
- **Default:**: 
- **angle**: Type:
float
- **Type:**: 
- **radius**: Type:
position
- **Type:**: 

## properties / cropping-and-resizing
- **crop**: Type:
None or (position, position, position, position)
- **Type:**: None
- **Default:**: 
- **corner1**: Type:
None or (position, position)
- **Type:**: None
- **Default:**: 
- **corner2**: Type:
None or (position, position)
- **Type:**: None
- **Default:**: 
- **xysize**: Type:
None or (position, position)
- **Type:**: None
- **Default:**: 
- **xsize**: Type:
None or position
- **Type:**: None
- **Default:**: 
- **ysize**: Type:
None or position
- **Type:**: None
- **Default:**: 
- **fit**: Type:
None or string
- **Type:**: None
- **Default:**: 
| Value,Description | contain,As large as possible, without exceeding any dimensions. Maintains
aspect ratio. | cover,As small as possible, while matching or exceeding all dimensions.
Maintains aspect ratio. | None or fill,Stretches/squashes displayable to exactly match dimensions. | scale-down,As for contain, but will never increase the size of the
displayable. | scale-up,As for cover, but will never decrease the size of the
displayable. |
- If both xsize and ysize are not None, both sizes are
used as the dimensions.
- If only one of those properties is not None, it is used as the sole
dimension.
- Otherwise, if fit is not None the area that the Transform is contained in
is used as the dimensions.

## properties / transitions
- **delay**: Type:
float
- **Type:**: 0.0
- **Default:**: 
- **events**: Type:
boolean
- **Type:**: True
- **Default:**: 

## properties / other
- **fps**: Type:
float or None
- **Type:**: None
- **Default:**: 
- **show_cancels_hide**: Type:
boolean
- **Type:**: True
- **Default:**: 
- **3D Stage properties:**: perspective, point_to, orientation, xrotate, yrotate, zrotate, matrixanchor, matrixtransform, zpos, zzoom
- **Model-based rendering properties:**: blend, mesh, mesh_pad, shader
- **GL Properties:**: The GL properties.
- **Uniforms:**: Properties beginning with u_ are uniforms that can be used by custom shaders.