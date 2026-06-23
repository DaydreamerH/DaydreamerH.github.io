add_executable(02_hello_triangle main.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(02_hello_triangle glfw opengl32)
endif()
