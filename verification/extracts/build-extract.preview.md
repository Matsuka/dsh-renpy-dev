
## build / basic-configuration
- **build.name = "..."**: This is used to automatically generate build.directory_name
and build.executable_name, if neither is set. This should not
contain spaces, colons, or semicolons.
- **build.directory_name = "..."**: This is used to create the names of directories in the archive
files. For example, if this is set to "mygame-1.0", the Linux
version of the project will unpack to "mygame-1.0-linux".
This is also used to determine the name of the directory in
which the package files are placed. For example, if you set
build.directory_name to mygame-1.0, the archive files will
be placed in mygame-1.0-dists in the directory above the base
directory.
This variable should not contain special characters like spaces,
colons, and semicolons. If not set, it defaults to build.name,
a dash, and the version. The version is taken from build.version,
if set, or config.version.
- **build.executable_name = "..."**: This variable controls the name of the executables that the user
clicks on to start the game.
This variable should not contain special characters like spaces,
colons, and semicolons. If not set, it defaults to build.name.
For example, if this is set to "mygame", the user will be able
to run mygame.exe on Windows, mygame.app on Macintosh, and
mygame.sh on Linux.

## build / classifying-and-ignoring-files
- **/**: The directory separator.
- *****: Matches all characters except for the directory separator.
- ******: Matches all characters.
- ****.txt**: Matches all txt files.
- **game/*.txt**: Matches txt files in the game directory.
- **all**: These files will be included in all packages, and in Android
builds.
- **linux**: These files will be included in packages targeting Linux.
- **mac**: These files will be included in packages targeting Macintosh.
- **windows**: These files will be included in packages targeting Windows.
- **renpy**: These files will be included in packages that require the Ren'Py
engine files. (Linux, Macintosh, and Windows.)
- **android**: These files will be included in Android builds.
- **archive**: These files will be included in the archive.rpa archive.
```
# Include README.txt
build.classify("README.txt", "all")

# But exclude all other txt files.
build.classify("**.txt", None)

# Add png and jpg files in the game directory into an archive.
build.classify("game/**.png", "archive")
build.classify("game/**.jpg", "archive")
```

## build / packages
```
# Declare a new archive belonging to a new "bonus" file list.
build.archive("bonus_archive", "bonus")

# Put the bonus files into the new archive.
build.classify("game/bonus/**", "bonus_archive")

# Declare the package.
build.package("all-premium", "zip", "windows mac linux renpy all bonus")
```

## build / archives
```
# Declare two archives.
build.archive("scripts", "all")
build.archive("images", "all")

# Put script files into the scripts archive.
build.classify("game/**.rpy", "scripts")
build.classify("game/**.rpyc", "scripts")

# Put images into the images archive.
build.classify("game/**.jpg", "images")
build.classify("game/**.png", "images")
```