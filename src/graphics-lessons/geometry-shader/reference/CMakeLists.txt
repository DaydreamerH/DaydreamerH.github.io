add_executable(22_geometry_shader geometry_shader.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(22_geometry_shader glfw opengl32)
endif()

foreach(FILE_NAME geometry_shader.vs geometry_shader.fs geometry_shader.gs)
    add_custom_command(TARGET 22_geometry_shader POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:22_geometry_shader>/${FILE_NAME}"
    )
endforeach()
