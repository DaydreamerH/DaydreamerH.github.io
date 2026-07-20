add_executable(24_MSAA msaa.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(24_MSAA glfw opengl32)
endif()

foreach(FILE_NAME cube.vs cube.fs screen.vs screen.fs)
    add_custom_command(TARGET 24_MSAA POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:24_MSAA>/${FILE_NAME}"
    )
endforeach()
