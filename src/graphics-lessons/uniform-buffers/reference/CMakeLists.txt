add_executable(21_uniform_buffers uniform_buffers.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(21_uniform_buffers glfw opengl32)
endif()

foreach(FILE_NAME cube.vs cube.fs)
    add_custom_command(TARGET 21_uniform_buffers POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:21_uniform_buffers>/${FILE_NAME}"
    )
endforeach()
