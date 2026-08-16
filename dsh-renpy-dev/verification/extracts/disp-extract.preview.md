
## dragdrop / drag-and-drop
- Allowing windows to be repositioned by the user, storing the window
positions.
- Card games that require cards to be dragged around the screen. (For
example, solitaire.)
- Inventory systems.
- Drag-to-reorder systems.

## movie / fullscreen-movies
```
$ renpy.movie_cutscene("On_Your_Mark.webm")
```

## movie / python-functions
- **renpy.movie_cutscene(filename, delay=None, loops=0, stop_music=True)**: This displays a movie cutscene for the specified number of
seconds. The user can click to interrupt the cutscene.
Overlays and Underlays are disabled for the duration of the cutscene.

filenameThe name of a file containing any movie playable by Ren'Py.
- **filename**: The number of seconds to wait before ending the cutscene.
Normally the length of the movie, in seconds. If None, then the
delay is computed from the number of loops (that is, loops + 1) *
the length of the movie. If -1, we wait until the user clicks.
- **delay**: The number of extra loops to show, -1 to loop forever.
- **loops**: 
- **class Movie(*, size=None, channel='movie', play=None, side_mask=False, mask=None, mask_channel=None, start_image=None, image=None, play_callback=None, loop=True, group=None, **properties)**: This is a displayable that shows the current movie.

sizeThis should be specified as either a tuple giving the width and
height of the movie, or None to automatically adjust to the size
of the playing movie. (If None, the displayable will be (0, 0)
when the movie is not playing.)
- **size**: The audio channel associated with this movie. When a movie file
is played on that channel, it will be displayed in this Movie
displayable. If this is left at the default of "movie", and play
is provided, a channel name is automatically selected, using
config.single_movie_channel and config.auto_movie_channel.
- **channel**: If given, this should be the path to a movie file, or a list
of paths to movie files. These movie
files will be automatically played on channel when the Movie is
shown, and automatically stopped when the movie is hidden.
- **play**: If true, this tells Ren'Py to use the side-by-side mask mode for
the Movie. In this case, the movie is divided in half. The left
half is used for color information, while the right half is used
for alpha information. The width of the displayable is half the
width of the movie file.
Where possible, side_mask should be used over mask as it has
no chance of frames going out of sync.
- **side_mask**: If given, this should be the path to a movie file, or a list of paths
to movie files, that are used as
the alpha channel of this displayable. The movie file will be
automatically played on movie_channel when the Movie is shown,
and automatically stopped when the movie is hidden.
- **mask**: The channel the alpha mask video is played on. If not given,
defaults to channel_mask. (For example, if channel is "sprite",
mask_channel defaults to "sprite_mask".)
- **mask_channel**: An image that is displayed when playback has started, but the
first frame has not yet been decoded.
- **start_image**: An image that is displayed when play has been given, but the
file it refers to does not exist. (For example, this can be used
to create a slimmed-down mobile version that does not use movie
sprites.) Users can also choose to fall back to this image as a
preference if video is too taxing for their system. The image will
also be used if the video plays, and then the movie ends, unless
group is given.
- **image**: If not None, a function that's used to start the movies playing.
(This may do things like queue a transition between sprites, if
desired.) It's called with the following arguments:

oldThe old Movie object, or None if the movie is not playing.
- **play_callback**: The new Movie object.
- **old**: 
- **new**: 
```
def play_callback(old, new):

renpy.music.play(new._play, channel=new.channel, loop=new.loop, synchro_start=True)

if new.mask:
renpy.music.play(new.mask, channel=new.mask_channel, loop=new.loop, synchro_start=True)
```