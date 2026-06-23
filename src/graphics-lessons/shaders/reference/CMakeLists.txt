set(DEMO_FILES 
    shader_uniform.cpp 
    vertex_attributes.cpp
)

foreach(DEMO_FILE ${DEMO_FILES})
    get_filename_component(DEMO_NAME ${DEMO_FILE} NAME_WE)
    
    add_executable(${DEMO_NAME} ${DEMO_FILE} ${GLAD_SOURCE})
    
    if(WIN32)
        target_link_libraries(${DEMO_NAME} glfw opengl32)
    endif()
endforeach()