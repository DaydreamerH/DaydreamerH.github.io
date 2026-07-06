add_executable(19_frame_buffers frame_buffers.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(19_frame_buffers glfw opengl32)
endif()

foreach(FILE_NAME shader.vs shader.fs shader_screen.vs shader_screen.fs)
    add_custom_command(TARGET 19_frame_buffers POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:19_frame_buffers>/${FILE_NAME}"
    )
endforeach()

foreach(FILE_NAME container.png wall.jpg)
    add_custom_command(TARGET 19_frame_buffers POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_SOURCE_DIR}/images/${FILE_NAME}"
        "$<TARGET_FILE_DIR:19_frame_buffers>/${FILE_NAME}"
    )
endforeach()
