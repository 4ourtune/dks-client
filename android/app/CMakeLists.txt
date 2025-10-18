cmake_minimum_required(VERSION 3.4.1)

# Suppress dollar-in-identifier warnings globally
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wno-dollar-in-identifier-extension")
set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -Wno-dollar-in-identifier-extension")

# Set global compiler options
add_compile_options(-Wno-dollar-in-identifier-extension)
